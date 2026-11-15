/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

/**
 * Bridges the WebView player to Android: an active MediaSession (system media
 * panel, HyperOS focus/island surface) and the home screen widget.
 */
@CapacitorPlugin(name = "MediaBridge")
public class MediaBridgePlugin extends Plugin {

    static final String WIDGET_PREFS = "stay_tuned_widget";
    private static WeakReference<MediaBridgePlugin> current;

    @Override
    public void load() {
        current = new WeakReference<>(this);
        requestNotificationPermission();
    }

    @Override
    protected void handleOnDestroy() {
        current = null;
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (getActivity() != null) {
            getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4101);
        }
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        String title = call.getString("title", "");
        String subtitle = call.getString("subtitle", "");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        double position = call.getDouble("position", 0.0);
        double duration = call.getDouble("duration", 0.0);
        boolean live = Boolean.TRUE.equals(call.getBoolean("isLive", false));

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putString("title", title)
                .putString("subtitle", subtitle)
                .putBoolean("playing", playing)
                .apply();
        StayTunedWidget.refreshAll(context);

        Intent intent = new Intent(context, PlaybackService.class);
        intent.setAction(PlaybackService.ACTION_UPDATE);
        intent.putExtra("title", title);
        intent.putExtra("subtitle", subtitle);
        intent.putExtra("playing", playing);
        intent.putExtra("position", position);
        intent.putExtra("duration", duration);
        intent.putExtra("live", live);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception ignored) {
            // Starting from the background is not allowed; the UI will retry.
        }
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        StayTunedWidget.refreshAll(context);
        Intent intent = new Intent(context, PlaybackService.class);
        intent.setAction(PlaybackService.ACTION_STOP);
        try {
            context.startService(intent);
        } catch (Exception ignored) {
            // Nothing playing.
        }
        call.resolve();
    }

    /** Hand an action from the widget / notification to the running web player. */
    static boolean dispatch(String action) {
        MediaBridgePlugin plugin = current == null ? null : current.get();
        if (plugin == null) return false;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("mediaAction", data, true);
        return true;
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        String pending = MainActivity.takePendingAction();
        JSObject result = new JSObject();
        if (pending != null) result.put("action", pending);
        call.resolve(result);
    }
}
