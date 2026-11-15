/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;

/**
 * Foreground media session. Android surfaces this in the system media panel,
 * which HyperOS also mirrors in its "focus" / dynamic island surface.
 */
public class PlaybackService extends Service {

    static final String ACTION_UPDATE = "io.github.xzl01.staytuned.MEDIA_UPDATE";
    static final String ACTION_STOP = "io.github.xzl01.staytuned.MEDIA_STOP";
    static final String ACTION_PLAY = "io.github.xzl01.staytuned.MEDIA_PLAY";
    static final String ACTION_PAUSE = "io.github.xzl01.staytuned.MEDIA_PAUSE";
    static final String ACTION_NEXT = "io.github.xzl01.staytuned.MEDIA_NEXT";
    static final String ACTION_PREV = "io.github.xzl01.staytuned.MEDIA_PREV";

    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 1201;
    private static final int CONTENT_REQUEST = 1202;

    private MediaSession session;
    private String title = "";
    private String subtitle = "";
    private boolean playing = false;
    private boolean live = true;
    private long positionMs = 0;
    private long durationMs = 0;
    private boolean foreground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        session = new MediaSession(this, "StayTuned");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MediaBridgePlugin.dispatch("play"); }
            @Override public void onPause() { MediaBridgePlugin.dispatch("pause"); }
            @Override public void onSkipToNext() { MediaBridgePlugin.dispatch("next"); }
            @Override public void onSkipToPrevious() { MediaBridgePlugin.dispatch("prev"); }
            @Override public void onSeekTo(long pos) { MediaBridgePlugin.dispatch("seek:" + (pos / 1000.0)); }
            @Override public void onStop() { MediaBridgePlugin.dispatch("pause"); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            releaseSession();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(action)) { safeDispatch("play"); publish(); return START_STICKY; }
        if (ACTION_PAUSE.equals(action)) { safeDispatch("pause"); publish(); return START_STICKY; }
        if (ACTION_NEXT.equals(action)) { safeDispatch("next"); return START_STICKY; }
        if (ACTION_PREV.equals(action)) { safeDispatch("prev"); return START_STICKY; }

        if (intent != null && ACTION_UPDATE.equals(action)) {
            title = intent.getStringExtra("title");
            subtitle = intent.getStringExtra("subtitle");
            playing = intent.getBooleanExtra("playing", false);
            live = intent.getBooleanExtra("live", true);
            positionMs = (long) (intent.getDoubleExtra("position", 0) * 1000);
            durationMs = (long) (intent.getDoubleExtra("duration", 0) * 1000);
            if (title == null) title = "";
            if (subtitle == null) subtitle = "";
        }
        publish();
        return START_STICKY;
    }

    private void safeDispatch(String action) {
        if (MediaBridgePlugin.dispatch(action)) return;
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra(MainActivity.EXTRA_ACTION, action);
        MainActivity.setPendingAction(action);
        startActivity(launch);
    }

    private void publish() {
        if (session == null) return;

        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "留频");
        Drawable icon = loadDrawable(R.mipmap.ic_launcher);
        if (icon instanceof BitmapDrawable) {
            Bitmap art = ((BitmapDrawable) icon).getBitmap();
            if (art != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
        }
        if (!live && durationMs > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        session.setMetadata(meta.build());

        PlaybackState.Builder state = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | (live ? 0 : PlaybackState.ACTION_SEEK_TO))
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        live ? PlaybackState.PLAYBACK_POSITION_UNKNOWN : positionMs,
                        playing ? 1f : 0f);
        session.setPlaybackState(state.build());

        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foreground = true;
        } catch (Exception ignored) {
            // Missing notification permission (Android 13+) keeps the UI usable.
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
                .setOnlyAlertOnce(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.addAction(action(R.drawable.ic_media_prev, "上一集", ACTION_PREV));
            builder.addAction(action(
                    playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play,
                    playing ? "暂停" : "播放",
                    playing ? ACTION_PAUSE : ACTION_PLAY));
            builder.addAction(action(R.drawable.ic_media_next, "下一集", ACTION_NEXT));
            Notification.MediaStyle style = new Notification.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(style);
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

    private Drawable loadDrawable(int id) {
        try {
            return getDrawable(id);
        } catch (Exception error) {
            Bitmap fallback = BitmapFactory.decodeResource(getResources(), id);
            return fallback == null ? null : new BitmapDrawable(getResources(), fallback);
        }
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

    private void releaseSession() {
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (foreground) {
            stopForeground(true);
            foreground = false;
        }
    }

    @Override
    public void onDestroy() {
        releaseSession();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
