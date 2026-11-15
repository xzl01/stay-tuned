/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * The motor side of haptics.
 *
 * Kept apart from {@link HapticsPlugin} so that API 24/25 devices never need to
 * load {@code VibrationEffect} (added in API 26): every method that touches the
 * newer classes is only invoked behind a version check.
 *
 * All effects are classified as {@code USAGE_TOUCH}, so the system applies the
 * user's touch-feedback switch and intensity scaling for us.
 */
final class HapticMotor {

    private static final long MIN_GAP_MS = 24;
    private static long lastPlayAt = 0;

    private HapticMotor() {}

    private static Vibrator vibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager =
                    (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (manager != null) return manager.getDefaultVibrator();
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    static boolean hasVibrator(Context context) {
        try {
            Vibrator vibrator = vibrator(context);
            return vibrator != null && vibrator.hasVibrator();
        } catch (Throwable ignored) {
            return false;
        }
    }

    static boolean hasAmplitudeControl(Context context) {
        if (Build.VERSION.SDK_INT < 26) return false;
        try {
            Vibrator vibrator = vibrator(context);
            return vibrator != null && vibrator.hasAmplitudeControl();
        } catch (Throwable ignored) {
            return false;
        }
    }

    static boolean hasPrimitives(Context context) {
        if (Build.VERSION.SDK_INT < 30) return false;
        try {
            Vibrator vibrator = vibrator(context);
            return vibrator != null && vibrator.areAllPrimitivesSupported(
                    android.os.VibrationEffect.Composition.PRIMITIVE_CLICK,
                    android.os.VibrationEffect.Composition.PRIMITIVE_TICK);
        } catch (Throwable ignored) {
            return false;
        }
    }

    static boolean hasEnvelopeEffects(Context context) {
        if (Build.VERSION.SDK_INT < 36) return false;
        try {
            Vibrator vibrator = vibrator(context);
            return vibrator != null && vibrator.areEnvelopeEffectsSupported();
        } catch (Throwable ignored) {
            return false;
        }
    }

    /**
     * Plays one shaped effect: a waveform when timings/amplitudes are given,
     * otherwise a single pulse. Silently does nothing without a usable motor.
     */
    static void play(Context context, long[] timings, int[] amplitudes,
                     int durationMs, int amplitude) {
        if (Build.VERSION.SDK_INT < 26) return;

        Vibrator vibrator;
        try {
            vibrator = vibrator(context);
            if (vibrator == null || !vibrator.hasVibrator()) return;
        } catch (Throwable ignored) {
            return;
        }

        long now = System.currentTimeMillis();
        if (now - lastPlayAt < MIN_GAP_MS) return;

        android.os.VibrationEffect effect;
        if (timings != null && amplitudes != null && timings.length > 1) {
            effect = android.os.VibrationEffect.createWaveform(timings, amplitudes, -1);
        } else {
            effect = android.os.VibrationEffect.createOneShot(durationMs, amplitude);
        }

        lastPlayAt = now;
        if (Build.VERSION.SDK_INT >= 33) {
            vibrator.vibrate(effect,
                    android.os.VibrationAttributes.createForUsage(
                            android.os.VibrationAttributes.USAGE_TOUCH));
        } else if (Build.VERSION.SDK_INT >= 30) {
            vibrator.vibrate(effect, new android.os.VibrationAttributes.Builder()
                    .setUsage(android.os.VibrationAttributes.USAGE_TOUCH)
                    .build());
        } else {
            // Legacy path: SONIFICATION is the AudioAttributes equivalent of USAGE_TOUCH.
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            vibrator.vibrate(effect, attributes);
        }
    }
}
