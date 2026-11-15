/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Haptic feedback bridge.
 *
 * <p>Two channels:
 * <ul>
 *   <li>{@link #feedback} performs a system {@link HapticFeedbackConstants} effect on
 *       the WebView. It needs no permission and inherits the platform / OEM tuning
 *       plus the user's touch-feedback intensity.</li>
 *   <li>{@link #play} sends a shaped waveform through {@link HapticMotor}. It needs
 *       {@code android.permission.VIBRATE} and is used for the few cues that must feel
 *       mechanical (lever, detent snap, long-press escalation, 3D egg power-on).</li>
 * </ul>
 */
@CapacitorPlugin(name = "Haptics")
public class HapticsPlugin extends Plugin {

    private static final int MAX_STEPS = 24;

    @PluginMethod
    public void capabilities(PluginCall call) {
        Context context = getContext();
        boolean hasVibrator = HapticMotor.hasVibrator(context);
        JSObject result = new JSObject();
        result.put("hasVibrator", hasVibrator);
        result.put("apiLevel", Build.VERSION.SDK_INT);
        result.put("touchFeedbackEnabled", touchFeedbackEnabled(context));
        result.put("amplitude", hasVibrator && Build.VERSION.SDK_INT >= 26
                && HapticMotor.hasAmplitudeControl(context));
        result.put("primitives", hasVibrator && Build.VERSION.SDK_INT >= 30
                && HapticMotor.hasPrimitives(context));
        result.put("envelope", hasVibrator && Build.VERSION.SDK_INT >= 36
                && HapticMotor.hasEnvelopeEffects(context));
        result.put("custom", Build.VERSION.SDK_INT >= 26);
        call.resolve(result);
    }

    /** System-tuned channel: no VIBRATE permission required. */
    @PluginMethod
    public void feedback(PluginCall call) {
        Integer requested = call.getInt("constant", HapticFeedbackConstants.VIRTUAL_KEY);
        int constant = requested == null ? HapticFeedbackConstants.VIRTUAL_KEY : requested;
        View view = getBridge() == null ? null : getBridge().getWebView();
        if (view == null || getActivity() == null) {
            call.resolve(new JSObject().put("ok", false));
            return;
        }
        getActivity().runOnUiThread(() -> {
            boolean ok = false;
            try {
                ok = view.isAttachedToWindow() && view.performHapticFeedback(constant);
            } catch (Exception ignored) {
                // A missing actuator must never break the UI.
            }
            call.resolve(new JSObject().put("ok", ok));
        });
    }

    /** Custom channel: one waveform or one pulse, always classified as USAGE_TOUCH. */
    @PluginMethod
    public void play(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT < 26
                || !HapticMotor.hasVibrator(context)
                || !touchFeedbackEnabled(context)) {
            call.resolve();
            return;
        }

        long[] timings = null;
        int[] amplitudes = null;
        JSArray timingsJson = call.getArray("timings");
        if (timingsJson != null && timingsJson.length() > 1) {
            JSArray amplitudesJson = call.getArray("amplitudes");
            try {
                List<Object> rawTimings = timingsJson.toList();
                List<Object> rawAmplitudes = amplitudesJson == null ? null : amplitudesJson.toList();
                int size = Math.min(rawTimings.size(), MAX_STEPS);
                timings = new long[size];
                amplitudes = new int[size];
                for (int i = 0; i < size; i++) {
                    timings[i] = Math.max(0, ((Number) rawTimings.get(i)).longValue());
                    amplitudes[i] = rawAmplitudes != null && i < rawAmplitudes.size()
                            ? clamp(((Number) rawAmplitudes.get(i)).intValue())
                            : 255;
                }
            } catch (Exception malformed) {
                call.resolve();
                return;
            }
        }

        Integer durationValue = call.getInt("duration", 8);
        Integer amplitudeValue = call.getInt("amplitude", 120);
        int duration = Math.max(1, Math.min(120, durationValue == null ? 8 : durationValue));
        int amplitude = clamp(amplitudeValue == null ? 120 : amplitudeValue);
        try {
            HapticMotor.play(context, timings, amplitudes, duration, amplitude);
        } catch (Throwable ignored) {
            // Old devices, broken HALs, vendor quirks: silence is the correct fallback.
        }
        call.resolve();
    }

    private static int clamp(int amplitude) {
        return Math.max(1, Math.min(255, amplitude));
    }

    private static boolean touchFeedbackEnabled(Context context) {
        try {
            return Settings.System.getInt(context.getContentResolver(),
                    Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 1;
        } catch (Exception ignored) {
            return true;
        }
    }
}
