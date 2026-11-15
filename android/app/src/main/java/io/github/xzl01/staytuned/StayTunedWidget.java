/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

/** Home screen widget: shows what is playing and offers transport controls. */
public class StayTunedWidget extends AppWidgetProvider {

    static final String ACTION = "io.github.xzl01.staytuned.WIDGET_ACTION";
    static final String EXTRA_ACTION = "action";

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StayTunedWidget.class));
        for (int id : ids) render(context, manager, id);
    }

    static void render(Context context, AppWidgetManager manager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(MediaBridgePlugin.WIDGET_PREFS, Context.MODE_PRIVATE);
        String title = prefs.getString("title", "");
        String subtitle = prefs.getString("subtitle", "");
        boolean playing = prefs.getBoolean("playing", false);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_stay_tuned);
        views.setTextViewText(R.id.widget_title, title.isEmpty() ? "留频" : title);
        views.setTextViewText(R.id.widget_subtitle, subtitle.isEmpty() ? "未在播放" : subtitle);
        views.setImageViewResource(R.id.widget_play, playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play);
        views.setContentDescription(R.id.widget_play, playing ? "暂停" : "播放");

        views.setOnClickPendingIntent(R.id.widget_prev, actionIntent(context, "prev", 1));
        views.setOnClickPendingIntent(R.id.widget_play, actionIntent(context, playing ? "pause" : "play", 2));
        views.setOnClickPendingIntent(R.id.widget_next, actionIntent(context, "next", 3));
        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context, 4));

        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent actionIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, StayTunedWidget.class);
        intent.setAction(ACTION);
        intent.putExtra(EXTRA_ACTION, action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    private static PendingIntent openAppIntent(Context context, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) render(context, manager, id);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || !ACTION.equals(intent.getAction())) return;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) return;

        if (!MediaBridgePlugin.dispatch(action)) {
            MainActivity.setPendingAction(action);
            Intent launch = new Intent(context, MainActivity.class);
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launch.putExtra(MainActivity.EXTRA_ACTION, action);
            context.startActivity(launch);
        }
    }
}
