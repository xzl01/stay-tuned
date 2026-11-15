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
    static final String ACTION_NEXT = "io.github.xzl01.staytuned.MEDIA_NEXT";
    static final String ACTION_PREV = "io.github.xzl01.staytuned.MEDIA_PREV";
    static final String ACTION_STOP = "io.github.xzl01.staytuned.MEDIA_STOP";

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
    private Bitmap artwork;
    private boolean live = true;
    private boolean playing = false;
    private boolean foreground = false;
    private long positionMs = 0;
    private long durationMs = 0;
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
            if (playing) mainHandler.postDelayed(this, uiVisible ? 1000 : 5000);
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
                    emitEvent("ended");
                    publish();
                    showNotification();
                } else if (state == Player.STATE_READY) {
                    emitState();
                }
            }
            @Override public void onPlayerError(PlaybackException error) {
                playing = false;
                publish();
                JSObject data = new JSObject();
                data.put("message", error.getErrorCodeName());
                MediaBridgePlugin.emit("nativeError", data);
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
                break;
            }
            case ACTION_NEXT:
                forward("next");
                break;
            case ACTION_PREV:
                forward("prev");
                break;
            case ACTION_STOP:
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
        live = intent.getBooleanExtra("live", true);
        rate = (float) intent.getDoubleExtra("rate", 1.0);
        volume = (float) intent.getDoubleExtra("volume", 1.0);
        positionMs = (long) (intent.getDoubleExtra("position", 0) * 1000);
        String url = orEmpty(intent.getStringExtra("url"));
        boolean autoplay = intent.getBooleanExtra("playing", false);

        player.setPlaybackSpeed(rate);
        player.setVolume(volume);
        if (!url.isEmpty()) {
            player.setMediaItem(MediaItem.fromUri(url));
            player.prepare();
            if (positionMs > 0) player.seekTo(positionMs);
        }
        player.setPlayWhenReady(autoplay);
        playing = autoplay;

        loadArtwork(orEmpty(intent.getStringExtra("artwork")));
        syncWidget();
        publish();
        showNotification();
        emitState();
    }

    private void resume() {
        ensurePlayer();
        player.setPlayWhenReady(true);
        playing = true;
        publish();
        emitState();
    }

    private void pause() {
        if (player != null) player.setPlayWhenReady(false);
        playing = false;
        publish();
        showNotification();
        emitState();
    }

    private void seekTo(long ms) {
        positionMs = Math.max(0, ms);
        if (player != null) player.seekTo(positionMs);
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
        return title + '\u0001' + subtitle + '\u0001' + artworkUrl + '\u0001' + (live ? '1' : '0');
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
        Bitmap art = artwork != null ? artwork : appIcon();
        if (art != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
        }
        meta.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON,
                BitmapFactory.decodeResource(getResources(), R.drawable.ic_stat_tuned));
        if (!live && durationMs > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        return meta.build();
    }

    private Bitmap appIcon() {
        Drawable icon = getDrawable(R.mipmap.ic_launcher);
        return icon instanceof BitmapDrawable ? ((BitmapDrawable) icon).getBitmap() : null;
    }

    private void showNotification() {
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
        Bitmap large = artwork;
        if (large != null) builder.setLargeIcon(large);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.addAction(action(R.drawable.ic_media_prev, "上一集", ACTION_PREV));
            builder.addAction(action(
                    playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play,
                    playing ? "暂停" : "播放",
                    playing ? ACTION_PAUSE : ACTION_PLAY));
            builder.addAction(action(R.drawable.ic_media_next, "下一集", ACTION_NEXT));
            builder.setStyle(new Notification.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
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
        if (!uiVisible) return;
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
