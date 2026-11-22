/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

/**
 * Bridges the WebView UI to the native player: ExoPlayer owns playback, the
 * service mirrors it into a MediaSession (system panel / HyperOS island) and
 * the home screen widget, and this plugin carries commands and state.
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
        PlaybackService.uiVisible = false;
    }

    @Override
    protected void handleOnResume() {
        PlaybackService.uiVisible = true;
    }

    @Override
    protected void handleOnPause() {
        PlaybackService.uiVisible = false;
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

    private void send(String action, Intent intent) {
        intent.setClass(getContext(), PlaybackService.class);
        intent.setAction(action);
        // Only a load starts a foreground service. Rate/volume/display/seek
        // commands can also arrive when nothing is playing; promoting those with
        // startForegroundService() would trip the 5s startForeground() contract
        // and crash the app with ForegroundServiceDidNotStartInTimeException.
        try {
            if (PlaybackService.ACTION_LOAD.equals(action)) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
        } catch (IllegalStateException ignored) {
            // Background service start is not allowed; the command is a no-op.
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("url", call.getString("url", ""));
        intent.putExtra("title", call.getString("title", ""));
        intent.putExtra("subtitle", call.getString("subtitle", ""));
        intent.putExtra("artwork", call.getString("artwork", ""));
        intent.putExtra("position", call.getDouble("position", 0.0));
        intent.putExtra("rate", call.getDouble("rate", 1.0));
        intent.putExtra("volume", call.getDouble("volume", 1.0));
        intent.putExtra("live", Boolean.TRUE.equals(call.getBoolean("live", false)));
        intent.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)));
        intent.putExtra("chapter", call.getString("chapter", ""));
        intent.putExtra("key", call.getString("key", ""));
        send(PlaybackService.ACTION_LOAD, intent);
        call.resolve(new JSObject().put("ok", true));
    }

    /** Last theme applied to the window chrome, so we only touch it on change. */
    private String appliedChromeTheme = "";

    @PluginMethod
    public void updateDisplay(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("chapter", call.getString("chapter", ""));
        intent.putExtra("volume", call.getDouble("volume", 1.0));
        intent.putExtra("mode", call.getString("mode", "skeuo"));
        String theme = call.getString("theme", "light");
        intent.putExtra("theme", theme);
        applyChromeTheme("dark".equals(theme));
        send(PlaybackService.ACTION_UPDATE_DISPLAY, intent);
        call.resolve();
    }

    /**
     * The window is drawn edge to edge, so the strip behind the status and
     * gesture bars is painted by the window itself. Match it to the page's
     * surface, and flip the bar icons so they stay legible on both themes.
     */
    private void applyChromeTheme(boolean dark) {
        String key = dark ? "dark" : "light";
        if (key.equals(appliedChromeTheme)) return;
        appliedChromeTheme = key;

        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            int color = dark ? 0xFF121410 : 0xFFEFECE4;
            activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        send(PlaybackService.ACTION_PLAY, new Intent());
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        send(PlaybackService.ACTION_PAUSE, new Intent());
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("position", call.getDouble("position", 0.0));
        send(PlaybackService.ACTION_SEEK, intent);
        call.resolve();
    }

    @PluginMethod
    public void setRate(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("rate", call.getDouble("rate", 1.0));
        send(PlaybackService.ACTION_RATE, intent);
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("volume", call.getDouble("volume", 1.0));
        send(PlaybackService.ACTION_VOLUME, intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        send(PlaybackService.ACTION_STOP, new Intent());
        call.resolve();
    }

    /** Hand an action from the widget / notification to the running web UI. */
    static boolean dispatch(String action) {
        MediaBridgePlugin plugin = current == null ? null : current.get();
        if (plugin == null) return false;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("mediaAction", data, true);
        return true;
    }

    /** State or event coming from the service. */
    static void emit(String event, JSObject data) {
        MediaBridgePlugin plugin = current == null ? null : current.get();
        if (plugin == null) return;
        plugin.notifyListeners(event, data, true);
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        String pending = MainActivity.takePendingAction();
        JSObject result = new JSObject();
        if (pending != null) result.put("action", pending);
        call.resolve(result);
    }
}
