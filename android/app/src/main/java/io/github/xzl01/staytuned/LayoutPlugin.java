/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands the system bar insets to the page.
 *
 * The app draws edge to edge (Android 15+ enforces it), but a WebView reports
 * `env(safe-area-inset-*)` as 0, so the web layer cannot know where the clock or
 * the gesture bar is. Reporting the insets lets the page keep its own textured
 * background behind the bars while padding its content — a flat native strip
 * next to a paper-textured surface reads as a seam.
 */
@CapacitorPlugin(name = "Layout")
public class LayoutPlugin extends Plugin {

    private Insets lastInsets;

    @Override
    public void load() {
        View content = getActivity().findViewById(android.R.id.content);
        if (content == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            lastInsets = bars;
            notifyListeners("insets", toJs(bars));
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    @PluginMethod
    public void get(PluginCall call) {
        Insets bars = lastInsets;
        if (bars == null) {
            View content = getActivity().findViewById(android.R.id.content);
            WindowInsetsCompat insets = content == null ? null : ViewCompat.getRootWindowInsets(content);
            if (insets != null) bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
        }
        if (bars == null) {
            JSObject zero = new JSObject();
            zero.put("top", 0);
            zero.put("bottom", 0);
            zero.put("left", 0);
            zero.put("right", 0);
            call.resolve(zero);
            return;
        }
        call.resolve(toJs(bars));
    }

    /** CSS pixels, not device pixels: the WebView scales by density. */
    private JSObject toJs(Insets bars) {
        float density = getActivity().getResources().getDisplayMetrics().density;
        JSObject data = new JSObject();
        data.put("top", bars.top / density);
        data.put("bottom", bars.bottom / density);
        data.put("left", bars.left / density);
        data.put("right", bars.right / density);
        return data;
    }
}
