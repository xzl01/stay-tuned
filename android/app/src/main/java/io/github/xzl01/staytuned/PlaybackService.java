/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.LruCache;

import java.lang.reflect.Method;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import com.getcapacitor.JSObject;

/**
 * Native playback. ExoPlayer owns the audio so the WebView does not have to stay
 * hot for background listening; the service mirrors state into a MediaSession
 * and the notification, and streams position back to the UI when it is visible.
 */
public class PlaybackService extends Service {

    /** Set by the plugin: only the focused UI needs per-second position events. */
    static volatile boolean uiVisible = true;

    static final String ACTION_LOAD = "io.github.xzl01.staytuned.MEDIA_LOAD";
    static final String ACTION_PLAY = "io.github.xzl01.staytuned.MEDIA_PLAY";
    static final String ACTION_PAUSE = "io.github.xzl01.staytuned.MEDIA_PAUSE";
    static final String ACTION_SEEK = "io.github.xzl01.staytuned.MEDIA_SEEK";
    static final String ACTION_RATE = "io.github.xzl01.staytuned.MEDIA_RATE";
    static final String ACTION_VOLUME = "io.github.xzl01.staytuned.MEDIA_VOLUME";
    static final String ACTION_UPDATE_DISPLAY = "io.github.xzl01.staytuned.MEDIA_UPDATE_DISPLAY";
    static final String ACTION_NEXT = "io.github.xzl01.staytuned.MEDIA_NEXT";
    static final String ACTION_PREV = "io.github.xzl01.staytuned.MEDIA_PREV";
    static final String ACTION_STOP = "io.github.xzl01.staytuned.MEDIA_STOP";

    private static final boolean REAR_SCREEN_DEVICE = isXiaomiRearScreenDevice();
    private static final String POSITION_PREFS = "stay_tuned_positions";
    /** Survives a service restart so a paused item can still be resumed. */
    private static final String SOURCE_PREFS = "stay_tuned_source";
    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 1201;
    private static final int CONTENT_REQUEST = 1202;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> artworkCache = new LruCache<>(6);

    private ExoPlayer player;
    private MediaSession session;

    private String title = "";
    private String subtitle = "";
    private String artworkUrl = "";
    private String loadingArtworkUrl = "";
    private String chapterLabel = "";
    private String displayMode = "skeuo";
    private String displayTheme = "light";
    private long lastReceiverRefreshMs = 0;
    private Bitmap artwork;
    private boolean live = true;
    private boolean playing = false;
    private boolean foreground = false;
    private String currentUrl = "";
    /** Stable episode id from the WebView; used as the progress storage key. */
    private String episodeKey = "";
    private long positionMs = 0;
    private long lastPersistedMs = 0;
    /** Seek to apply once the new media item is ready. -1 means none. */
    private long pendingSeekMs = -1;
    private long durationMs = 0;
    /** Set after ExoPlayer reports an error; the next play must rebuild. */
    private boolean needsPrepare = false;
    private boolean playWhenReadyWanted = false;
    private int errorRetries = 0;
    private static final int MAX_ERROR_RETRIES = 4;
    private long bufferedMs = 0;
    private float volume = 1f;
    private float rate = 1f;
    private String lastMetaKey = "";
    private String lastNotifyKey = "";
    private long sessionPositionMs = -1;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (player == null) return;
            positionMs = Math.max(0, player.getCurrentPosition());
            bufferedMs = Math.max(0, player.getBufferedPosition());
            long duration = player.getDuration();
            durationMs = duration == C.TIME_UNSET ? 0 : duration;
            // SystemUI extrapolates from PlaybackState, so the session only needs
            // an occasional correction instead of one update per second.
            if (sessionPositionMs < 0 || Math.abs(positionMs - sessionPositionMs) >= 15_000) {
                publish();
            }
            emitState();
            if (playing) {
                // ~5s cadence: survives a process kill without hammering flash.
                if (Math.abs(positionMs - lastPersistedMs) >= 5_000) persistCurrentPosition();
                mainHandler.postDelayed(this, uiVisible ? 1000 : 5000);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        session = new MediaSession(this, "StayTuned");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { forward("next"); }
            @Override public void onSkipToPrevious() { forward("prev"); }
            @Override public void onSeekTo(long pos) { seekTo(pos); }
            @Override public void onStop() { pause(); }
        });
        session.setActive(true);
    }

    private void ensurePlayer() {
        if (player != null) return;
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(
                new AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                        .build(),
                true);
        player.setHandleAudioBecomingNoisy(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Keeps the network alive so background radio does not stutter.
            player.setWakeMode(C.WAKE_MODE_NETWORK);
        }
        player.setVolume(volume);
        player.setPlaybackSpeed(rate);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean isPlaying) {
                // `isPlaying=false` also happens while buffering/erroring even
                // though the user still wants sound; keep the intent unless the
                // user explicitly paused (pause() clears it).
                playing = isPlaying;
                syncWidget();
                publish();
                emitState();
                mainHandler.removeCallbacks(ticker);
                if (isPlaying) mainHandler.post(ticker);
            }
            @Override public void onPlaybackStateChanged(int state) {
                // Frequent BUFFERING/READY flips must not each wake SystemUI.
                if (state == Player.STATE_ENDED) {
                    playing = false;
                    // Do not leave a snapshot at the very end: a later cold start
                    // would otherwise resume a finished episode at its tail.
                    clearPosition();
                    emitEvent("ended");
                    publish();
                    showNotification();
                } else if (state == Player.STATE_READY) {
                    errorRetries = 0;
                    if (pendingSeekMs >= 0) {
                        player.seekTo(pendingSeekMs);
                        positionMs = pendingSeekMs;
                        pendingSeekMs = -1;
                    }
                    emitState();
                }
            }
            @Override public void onPlayerError(PlaybackException error) {
                playing = false;
                needsPrepare = true;
                // Keep playWhenReadyWanted as-is: if the listener still wants
                // playback, the retry path above will rebuild and resume it.
                publish();
                JSObject data = new JSObject();
                data.put("message", error.getErrorCodeName());
                MediaBridgePlugin.emit("nativeError", data);
                // Network blips are the common case. Retry with backoff so
                // playback resumes without the user reopening the app; give up
                // after a few attempts to avoid a tight loop on a dead source.
                if (playWhenReadyWanted && errorRetries < MAX_ERROR_RETRIES) {
                    errorRetries++;
                    recoverPlayback(1500L * errorRetries);
                }
            }
        });
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) { publish(); return START_STICKY; }

        switch (action) {
            case ACTION_LOAD:
                load(intent);
                break;
            case ACTION_PLAY:
                resume();
                break;
            case ACTION_PAUSE:
                pause();
                break;
            case ACTION_SEEK:
                seekTo((long) (intent.getDoubleExtra("position", 0) * 1000));
                break;
            case ACTION_RATE: {
                rate = (float) intent.getDoubleExtra("rate", 1.0);
                if (player != null) player.setPlaybackSpeed(rate);
                emitState();
                break;
            }
            case ACTION_VOLUME: {
                volume = (float) intent.getDoubleExtra("volume", 1.0);
                if (player != null) player.setVolume(volume);
                if (REAR_SCREEN_DEVICE) refreshReceiverArtwork();
                break;
            }
            case ACTION_UPDATE_DISPLAY: {
                chapterLabel = orEmpty(intent.getStringExtra("chapter"));
                // Fall back to the current value: a missing field must not snap
                // the fader to maximum or reset the skin to the default.
                volume = (float) intent.getDoubleExtra("volume", volume);
                String mode = orEmpty(intent.getStringExtra("mode"));
                if (!mode.isEmpty()) displayMode = mode;
                String theme = orEmpty(intent.getStringExtra("theme"));
                if (!theme.isEmpty()) displayTheme = theme;
                if (REAR_SCREEN_DEVICE) refreshReceiverArtwork();
                break;
            }
            case ACTION_NEXT:
                forward("next");
                break;
            case ACTION_PREV:
                forward("prev");
                break;
            case ACTION_STOP:
                // An explicit stop throws the snapshot away; a system kill must not.
                clearSource();
                release();
                stopSelf();
                return START_NOT_STICKY;
            default:
                publish();
        }
        return START_STICKY;
    }

    private void load(Intent intent) {
        ensurePlayer();
        title = orEmpty(intent.getStringExtra("title"));
        subtitle = orEmpty(intent.getStringExtra("subtitle"));
        chapterLabel = orEmpty(intent.getStringExtra("chapter"));
        live = intent.getBooleanExtra("live", true);
        rate = (float) intent.getDoubleExtra("rate", 1.0);
        volume = (float) intent.getDoubleExtra("volume", 1.0);
        String url = orEmpty(intent.getStringExtra("url"));
        boolean autoplay = intent.getBooleanExtra("playing", false);
        // Set the identity before reading the snapshot: positionKey() is derived
        // from these fields, so restoring first would look up the previous
        // episode's key (or an empty one on a cold start) and always miss.
        currentUrl = url;
        episodeKey = orEmpty(intent.getStringExtra("key"));
        mainHandler.removeCallbacks(retryPrepare);
        positionMs = (long) (intent.getDoubleExtra("position", 0) * 1000);
        // Fall back to the native snapshot when the UI forgot the position
        // (fresh WebView, crash, or a process restart after a network drop).
        if (positionMs <= 0) positionMs = restorePosition();
        lastPersistedMs = positionMs;
        durationMs = 0;
        bufferedMs = 0;
        pendingSeekMs = -1;
        needsPrepare = false;
        errorRetries = 0;
        playWhenReadyWanted = autoplay;

        player.setPlaybackSpeed(rate);
        player.setVolume(volume);
        if (!url.isEmpty()) {
            player.setMediaItem(MediaItem.fromUri(url));
            player.prepare();
            // Seeking right after prepare() is dropped because the timeline is
            // not ready yet. Apply it from onPlaybackStateChanged(READY).
            pendingSeekMs = positionMs > 0 ? positionMs : -1;
        }
        player.setPlayWhenReady(autoplay);
        playing = autoplay;

        loadArtwork(orEmpty(intent.getStringExtra("artwork")));
        persistSource();
        syncWidget();
        publish();
        showNotification();
        emitState();
    }

    /**
     * Snapshot the current item. Android may stop this service while the user
     * has the app paused in the background; without this snapshot a later
     * resume() has no URL to rebuild and silently plays nothing.
     */
    private void persistSource() {
        if (currentUrl.isEmpty()) return;
        getSharedPreferences(SOURCE_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("url", currentUrl)
                .putString("title", title)
                .putString("subtitle", subtitle)
                .putString("artwork", artworkUrl)
                .putString("chapter", chapterLabel)
                .putString("key", episodeKey)
                .putBoolean("live", live)
                .putFloat("rate", rate)
                .putFloat("volume", volume)
                .putLong("position", positionMs)
                .apply();
    }

    /** Restore the snapshot after a process restart. False when there is none. */
    private boolean restoreSource() {
        if (!currentUrl.isEmpty()) return true;
        SharedPreferences prefs = getSharedPreferences(SOURCE_PREFS, Context.MODE_PRIVATE);
        String url = prefs.getString("url", "");
        if (url == null || url.isEmpty()) return false;
        currentUrl = url;
        title = orEmpty(prefs.getString("title", ""));
        subtitle = orEmpty(prefs.getString("subtitle", ""));
        artworkUrl = orEmpty(prefs.getString("artwork", ""));
        chapterLabel = orEmpty(prefs.getString("chapter", ""));
        episodeKey = orEmpty(prefs.getString("key", ""));
        live = prefs.getBoolean("live", live);
        rate = prefs.getFloat("rate", rate);
        volume = prefs.getFloat("volume", volume);
        positionMs = prefs.getLong("position", 0);
        lastPersistedMs = positionMs;
        return true;
    }

    private void clearSource() {
        getSharedPreferences(SOURCE_PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    private void resume() {
        ensurePlayer();
        // A restart while paused leaves the fresh player without a media item;
        // fall back to the snapshot so the notification / widget button still works.
        if (!restoreSource()) return;
        player.setPlaybackSpeed(rate);
        player.setVolume(volume);
        playWhenReadyWanted = true;
        mainHandler.removeCallbacks(retryPrepare);
        int state = player.getPlaybackState();
        boolean finished = state == Player.STATE_ENDED;
        boolean hasItem = player.getMediaItemCount() > 0;
        if (!hasItem || needsPrepare || state == Player.STATE_IDLE || finished) {
            // ExoPlayer cannot leave STATE_IDLE after an error (or STATE_ENDED
            // after a finished item) by playing alone; rebuilding the media item
            // is what makes recovery possible without restarting the whole app.
            needsPrepare = false;
            if (!currentUrl.isEmpty()) {
                player.setMediaItem(MediaItem.fromUri(currentUrl));
                player.prepare();
                // A finished episode restarts from the beginning.
                pendingSeekMs = finished ? 0 : (positionMs > 0 ? positionMs : -1);
                if (finished) {
                    positionMs = 0;
                    lastPersistedMs = 0;
                    clearPosition();
                }
            }
        }
        player.setPlayWhenReady(true);
        playing = true;
        persistSource();
        publish();
        showNotification();
        emitState();
    }

    /** Re-prepare from scratch, keeping the last known position. */
    private final Runnable retryPrepare = () -> {
        // A manual resume or a new load() may already have fixed the player;
        // rebuilding then would interrupt healthy playback.
        if (player == null || currentUrl.isEmpty()) return;
        if (!needsPrepare || player.getPlaybackState() != Player.STATE_IDLE) return;
        needsPrepare = false;
        player.setMediaItem(MediaItem.fromUri(currentUrl));
        player.prepare();
        pendingSeekMs = positionMs > 0 ? positionMs : -1;
        player.setPlayWhenReady(playWhenReadyWanted);
    };

    private void recoverPlayback(long delayMs) {
        if (currentUrl.isEmpty()) return;
        // Keep only the newest retry so backoff steps cannot queue up.
        mainHandler.removeCallbacks(retryPrepare);
        mainHandler.postDelayed(retryPrepare, delayMs);
    }

    private void pause() {
        playWhenReadyWanted = false;
        if (player != null) player.setPlayWhenReady(false);
        playing = false;
        publish();
        showNotification();
        emitState();
    }

    private void seekTo(long ms) {
        positionMs = Math.max(0, ms);
        if (player != null) {
            // A user seek must win over the restore position applied on READY.
            pendingSeekMs = -1;
            player.seekTo(positionMs);
        }
        persistCurrentPosition();
        publish();
        emitState();
    }

    private void forward(String action) {
        if (!MediaBridgePlugin.dispatch(action)) {
            JSObject data = new JSObject();
            data.put("action", action);
            MediaBridgePlugin.emit("nativeAction", data);
        }
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

    private void loadArtwork(String url) {
        if (url.equals(artworkUrl)) return;
        artworkUrl = url;
        artwork = url.isEmpty() ? null : artworkCache.get(url);
        if (artwork != null || url.isEmpty() || url.equals(loadingArtworkUrl)) {
            return;
        }
        loadingArtworkUrl = url;
        new Thread(() -> {
            Bitmap downloaded = null;
            try {
                java.net.HttpURLConnection connection =
                        (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setInstanceFollowRedirects(true);
                try (java.io.InputStream stream = connection.getInputStream()) {
                    Bitmap raw = BitmapFactory.decodeStream(stream);
                    if (raw != null) {
                        int max = 512;
                        float scale = Math.min(1f, (float) max / Math.max(raw.getWidth(), raw.getHeight()));
                        downloaded = scale < 1f
                                ? Bitmap.createScaledBitmap(raw, Math.round(raw.getWidth() * scale),
                                        Math.round(raw.getHeight() * scale), true)
                                : raw;
                    }
                }
            } catch (Exception ignored) {
                downloaded = null;
            }
            final Bitmap result = downloaded;
            mainHandler.post(() -> {
                if (!url.equals(artworkUrl)) return;
                loadingArtworkUrl = "";
                if (result != null) artworkCache.put(url, result);
                artwork = result;
                publish();
                showNotification();
            });
        }, "stay-tuned-artwork").start();
    }

    private String metaKey() {
        return title + '\u0001' + subtitle + '\u0001' + artworkUrl + '\u0001'
                + (live ? '1' : '0') + '\u0001'
                // Duration arrives asynchronously; without it in the key the
                // metadata is built once with duration 0 and never refreshed.
                + (durationMs / 5_000L) + '\u0001'
                + (REAR_SCREEN_DEVICE ? receiverDisplayKey() : "");
    }

    private String receiverDisplayKey() {
        // Bucket the clock into a modest refresh cadence: OEM music cards read
        // artwork from MediaSession, and rebuilding it every second is wasteful.
        return chapterLabel + '\u0001' + playing + '\u0001' + displayMode + '\u0001'
                + displayTheme + '\u0001' + Math.round(volume * 20) + '\u0001'
                + (positionMs / 15_000L);
    }

    private final Runnable receiverRefresh = () -> {
        lastReceiverRefreshMs = System.currentTimeMillis();
        lastMetaKey = "";
        lastNotifyKey = "";
        publish();
    };

    private void refreshReceiverArtwork() {
        // Trailing throttle: a plain "return" here would drop the final fader or
        // chapter update (the ticker only publishes every 15s, and not at all
        // while paused), leaving the rear card showing stale values.
        long wait = 5_000L - (System.currentTimeMillis() - lastReceiverRefreshMs);
        if (wait > 0) {
            mainHandler.removeCallbacks(receiverRefresh);
            mainHandler.postDelayed(receiverRefresh, wait);
        } else {
            receiverRefresh.run();
        }
    }

    private void publish() {
        if (session == null) return;
        String key = metaKey();
        if (!key.equals(lastMetaKey)) {
            lastMetaKey = key;
            session.setMetadata(buildMetadata());
        }
        PlaybackState.Builder state = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | (live ? 0 : PlaybackState.ACTION_SEEK_TO))
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        live ? PlaybackState.PLAYBACK_POSITION_UNKNOWN : positionMs,
                        playing ? rate : 0f);
        session.setPlaybackState(state.build());
        sessionPositionMs = positionMs;
        String notifyKey = key + '\u0001' + playing;
        if (foreground && notifyKey.equals(lastNotifyKey)) return;
        lastNotifyKey = notifyKey;
        showNotification();
    }

    private MediaMetadata buildMetadata() {
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "留频");
        Bitmap art = mediaArtwork();
        if (art != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
        }
        meta.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON,
                BitmapFactory.decodeResource(getResources(), R.drawable.ic_stat_tuned));
        if (!live && durationMs > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        return meta.build();
    }

    /**
     * Xiaomi's rear-screen music card reads MediaSession artwork. On those
     * devices prefer a generated receiver: the dynamic state stays inside the
     * small LCD, matching the app's hardware design. Other devices keep the
     * actual cover art so the normal media notification is unchanged.
     */
    private Bitmap mediaArtwork() {
        if (REAR_SCREEN_DEVICE) return receiverCard();
        return artwork != null ? artwork : appIcon();
    }

    private static boolean isXiaomiRearScreenDevice() {
        try {
            Class<?> type = Class.forName("miui.util.MiuiMultiDisplayTypeInfo");
            Method method = type.getMethod("isRearDevice");
            Object value = method.invoke(null);
            return Boolean.TRUE.equals(value);
        } catch (Throwable ignored) {
            return false;
        }
    }

    private Bitmap receiverCard() {
        int width = 640;
        int height = 640;
        boolean dark = "dark".equals(displayTheme);
        boolean flat = "flat".equals(displayMode);
        int page = Color.parseColor(dark ? "#181b17" : "#f7f6f0");
        int shell = Color.parseColor(dark ? "#2b2f28" : "#efece4");
        int shellEdge = Color.parseColor(dark ? "#3d4238" : "#d8d3c4");
        int ink = Color.parseColor(dark ? "#e8e7df" : "#30342e");
        int muted = Color.parseColor(dark ? "#a3a99b" : "#6b6f5f");
        int lcd = Color.parseColor(dark ? "#3a4539" : "#a5ac91");
        int lcdInk = Color.parseColor(dark ? "#d7dfce" : "#35402e");
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        paint.setColor(page);
        canvas.drawRect(0, 0, width, height, paint);

        float left = 42f;
        float top = 130f;
        float right = width - 42f;
        float bottom = 510f;
        paint.setColor(flat ? shell : Color.parseColor(dark ? "#20241f" : "#e8e4d8"));
        canvas.drawRoundRect(new RectF(left + 8, top + 14, right + 8, bottom + 18),
                34, 34, paint);
        paint.setColor(shell);
        canvas.drawRoundRect(new RectF(left, top, right, bottom), 34, 34, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(3f);
        paint.setColor(shellEdge);
        canvas.drawRoundRect(new RectF(left, top, right, bottom), 34, 34, paint);
        paint.setStyle(Paint.Style.FILL);

        // Speaker grille: fixed hardware decoration, no dynamic text on the shell.
        paint.setColor(ink);
        float grilleLeft = left + 28;
        float grilleRight = left + 245;
        float grilleTop = top + 42;
        float grilleBottom = bottom - 62;
        for (float y = grilleTop; y <= grilleBottom; y += 18) {
            for (float x = grilleLeft; x <= grilleRight; x += 18) {
                canvas.drawCircle(x, y, 2.6f, paint);
            }
        }

        // Small reflective LCD: every dynamic *label* (status, time, chapter)
        // lives here; the shell only carries hardware decoration and faders.
        float screenLeft = left + 280;
        float screenTop = top + 42;
        float screenRight = right - 30;
        float screenBottom = screenTop + 96;
        paint.setColor(lcd);
        canvas.drawRoundRect(new RectF(screenLeft, screenTop, screenRight, screenBottom),
                14, 14, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(3f);
        paint.setColor(lcdInk);
        canvas.drawRoundRect(new RectF(screenLeft, screenTop, screenRight, screenBottom),
                14, 14, paint);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(lcdInk);
        paint.setTextSize(24f);
        paint.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL));
        String status = playing ? "▶" : "Ⅱ";
        String time = live ? "LIVE" : formatClock(positionMs);
        canvas.drawText(status, screenLeft + 18, screenTop + 38, paint);
        float timeWidth = paint.measureText(time);
        canvas.drawText(time, screenRight - 18 - timeWidth, screenTop + 38, paint);
        String chapter = currentChapterLabel();
        canvas.drawText(ellipsize(chapter, paint, screenRight - screenLeft - 36),
                screenLeft + 18, screenTop + 76, paint);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));

        // Chapter / volume faders: only position, never a numeric volume readout.
        drawFader(canvas, paint, screenLeft, screenTop + 132, screenRight - 18,
                0.58f, Color.parseColor("#c05a32"));
        drawFader(canvas, paint, screenLeft, screenTop + 200, screenRight - 18,
                volume, Color.parseColor("#6b705d"));

        paint.setColor(ink);
        paint.setTextSize(18f);
        canvas.drawText("章节", screenLeft, screenTop + 114, paint);
        canvas.drawText("音量", screenLeft, screenTop + 182, paint);
        paint.setTextSize(15f);
        paint.setColor(muted);
        canvas.drawText("留频", left + 28, bottom - 22, paint);
        canvas.drawText("PODCAST RECEIVER / 01", screenLeft + 2, bottom - 22, paint);

        // Transport buttons.
        float buttonY = bottom - 108;
        drawButton(canvas, paint, right - 260, buttonY, 60, Color.parseColor("#e3dfd2"));
        drawButton(canvas, paint, right - 186, buttonY, 60, Color.parseColor("#c05a32"));
        drawButton(canvas, paint, right - 112, buttonY, 60, Color.parseColor("#e3dfd2"));
        paint.setColor(ink);
        paint.setTextSize(20f);
        canvas.drawText("◀", right - 244, buttonY + 39, paint);
        canvas.drawText(playing ? "Ⅱ" : "▶", right - 172, buttonY + 39, paint);
        canvas.drawText("▶", right - 96, buttonY + 39, paint);
        return bitmap;
    }

    private void drawFader(Canvas canvas, Paint paint, float left, float y, float right,
            float position, int indicatorColor) {
        position = Math.max(0f, Math.min(1f, position));
        paint.setColor(Color.parseColor("#5f6457"));
        paint.setStrokeWidth(5f);
        canvas.drawLine(left, y, right, y, paint);
        paint.setStrokeWidth(3f);
        paint.setColor(Color.parseColor("#9a9d8e"));
        for (int i = 0; i <= 8; i++) {
            float x = left + (right - left) * i / 8f;
            canvas.drawLine(x, y - 14, x, y - 7, paint);
        }
        float thumbX = left + (right - left) * position;
        paint.setColor(Color.parseColor("#f4f1e8"));
        canvas.drawRoundRect(new RectF(thumbX - 22, y - 17, thumbX + 22, y + 17),
                8, 8, paint);
        paint.setStrokeWidth(2f);
        paint.setColor(Color.parseColor("#c9c4b6"));
        canvas.drawRoundRect(new RectF(thumbX - 22, y - 17, thumbX + 22, y + 17),
                8, 8, paint);
        paint.setColor(indicatorColor);
        paint.setStrokeWidth(4f);
        canvas.drawLine(thumbX, y - 11, thumbX, y + 11, paint);
    }

    private void drawButton(Canvas canvas, Paint paint, float left, float top,
            float size, int color) {
        paint.setColor(color);
        canvas.drawRoundRect(new RectF(left, top, left + size, top + size), 12, 12, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setColor(Color.parseColor("#c9c4b6"));
        canvas.drawRoundRect(new RectF(left, top, left + size, top + size), 12, 12, paint);
        paint.setStyle(Paint.Style.FILL);
    }

    private String currentChapterLabel() {
        if (!chapterLabel.isEmpty()) return chapterLabel;
        if (live) return "LIVE  " + (subtitle.isEmpty() ? "留频电台" : subtitle);
        return "01  " + (title.isEmpty() ? "留频" : title);
    }

    private static String formatClock(long ms) {
        long total = Math.max(0, ms / 1000);
        long hours = total / 3600;
        long minutes = (total % 3600) / 60;
        long seconds = total % 60;
        if (hours > 0) return hours + ":" + pad(minutes) + ":" + pad(seconds);
        return minutes + ":" + pad(seconds);
    }

    private static String pad(long value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    private static String ellipsize(String value, Paint paint, float maxWidth) {
        if (paint.measureText(value) <= maxWidth) return value;
        String suffix = "…";
        int end = value.length();
        while (end > 1 && paint.measureText(value.substring(0, end) + suffix) > maxWidth) end--;
        return value.substring(0, Math.max(1, end)) + suffix;
    }

    private Bitmap appIcon() {
        Drawable icon = getDrawable(R.mipmap.ic_launcher);
        if (icon == null) return null;
        // AdaptiveIconDrawable (API 26+) is not a BitmapDrawable, so draw it.
        if (icon instanceof BitmapDrawable) return ((BitmapDrawable) icon).getBitmap();
        try {
            int size = 192;
            Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            icon.setBounds(0, 0, size, size);
            icon.draw(canvas);
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private void showNotification() {
        // release() nulls the session; a late artwork callback or a stray command
        // after ACTION_STOP would otherwise NPE on session.getSessionToken().
        if (session == null) return;
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foreground = true;
        } catch (Exception ignored) {
            // Notification permission can be denied on Android 13+.
        }
    }

    private Notification buildNotification() {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        builder.setSmallIcon(R.drawable.ic_stat_tuned)
                .setContentTitle(title.isEmpty() ? "留频" : title)
                .setContentText(subtitle)
                .setContentIntent(contentIntent())
                .setDeleteIntent(serviceIntent(ACTION_STOP))
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(playing)
                .setShowWhen(false)
                .setOnlyAlertOnce(true);
        Bitmap large = mediaArtwork();
        if (large != null) builder.setLargeIcon(large);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.addAction(action(R.drawable.ic_media_prev, "上一集", ACTION_PREV));
            builder.addAction(action(
                    playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play,
                    playing ? "暂停" : "播放",
                    playing ? ACTION_PAUSE : ACTION_PLAY));
            builder.addAction(action(R.drawable.ic_media_next, "下一集", ACTION_NEXT));
            MediaSession live = session;
            if (live != null) {
                builder.setStyle(new Notification.MediaStyle()
                        .setMediaSession(live.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
            }
        }
        return builder.build();
    }

    private Notification.Action action(int icon, String label, String serviceAction) {
        return new Notification.Action.Builder(
                Icon.createWithResource(this, icon), label, serviceIntent(serviceAction)).build();
    }

    private PendingIntent contentIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, CONTENT_REQUEST, intent, flags);
    }

    private PendingIntent serviceIntent(String action) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, action.hashCode(), intent, flags);
    }

    /**
     * Persist the listening position in native storage.
     *
     * The WebView keeps its own positions map, but it is only written on
     * pagehide or every 30s of drift, and the UI is not running while the app is
     * killed from the recents list. Writing here means an episode resumes at the
     * right spot even if Android stops the process.
     */
    private void persistCurrentPosition() {
        lastPersistedMs = positionMs;
        persistPosition();
        // Keep the snapshot's resume point in step with the saved progress.
        if (!currentUrl.isEmpty()) {
            getSharedPreferences(SOURCE_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong("position", positionMs)
                    .apply();
        }
    }

    private void persistPosition() {
        if (live || currentUrl.isEmpty()) return;
        getSharedPreferences(POSITION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(positionKey(), positionMs)
                .putLong("savedAt", System.currentTimeMillis())
                .apply();
    }

    private long restorePosition() {
        if (live || currentUrl.isEmpty()) return 0;
        return getSharedPreferences(POSITION_PREFS, Context.MODE_PRIVATE)
                .getLong(positionKey(), 0);
    }

    private void clearPosition() {
        getSharedPreferences(POSITION_PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(positionKey())
                .apply();
    }

    /** Stable per-episode key: title + URL hash, independent of JS ids. */
    private String positionKey() {
        // The audio URL differs between streaming and a cached local file, so a
        // URL-derived key would split one episode into two progress records.
        // The WebView passes a stable episode key; fall back to URL+title only
        // when it is missing (older payloads).
        if (!episodeKey.isEmpty()) return "pos:" + episodeKey;
        return "pos:" + Integer.toHexString((currentUrl + '\u0001' + title).hashCode());
    }

    private void syncWidget() {
        getSharedPreferences(MediaBridgePlugin.WIDGET_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("title", title)
                .putString("subtitle", subtitle)
                .putBoolean("playing", playing)
                .apply();
        StayTunedWidget.refreshAll(this);
    }

    private void emitState() {
        // Keep sending a slow heartbeat while hidden: the WebView uses it to
        // persist progress, so a background kill still resumes correctly. This
        // does not wake the UI (it is not visible) and stays at the 5s ticker.
        if (!uiVisible && !playing) return;
        JSObject data = new JSObject();
        data.put("isPlaying", playing);
        data.put("position", positionMs / 1000.0);
        data.put("duration", durationMs / 1000.0);
        data.put("buffered", bufferedMs / 1000.0);
        data.put("state", playing ? "playing" : "paused");
        MediaBridgePlugin.emit("nativeState", data);
    }

    private void emitEvent(String event) {
        MediaBridgePlugin.emit(event, new JSObject());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "播放控制", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("显示当前播放内容并提供播放控制");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private void release() {
        persistCurrentPosition();
        mainHandler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (foreground) {
            stopForeground(true);
            foreground = false;
        }
        playing = false;
    }

    @Override
    public void onDestroy() {
        release();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
