/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * HarmonyOS haptics bridge.
 *
 * The cue vocabulary in `lib/haptics.ts` was written for Android's
 * HapticFeedbackConstants and shaped waveforms. ArkWeb cannot vibrate, so the
 * shapes are forwarded to ArkTS, which replays them on the linear motor:
 * a `duration` becomes one pulse, `timings` becomes an on/off pattern.
 */

interface HarmonyHapticsBridge {
  pulse(specJson: string): void;
}

declare global {
  interface Window {
    StayTunedHaptics?: HarmonyHapticsBridge;
  }
}

export interface HarmonyHapticShape {
  duration?: number;
  timings?: number[];
  /** 1-255 per segment, mirroring the Android cue table. */
  amplitudes?: number[];
}

export function isHarmonyHapticsAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.StayTunedHaptics?.pulse === 'function';
}

/**
 * `timings` already alternates off/on starting with a delay, which is exactly
 * what the platform pattern expects, so only the numbers are forwarded.
 */
export function pulseHarmony(shape: HarmonyHapticShape): void {
  const bridge = typeof window === 'undefined' ? undefined : window.StayTunedHaptics;
  if (!bridge) return;

  const spec =
    shape.timings && shape.timings.length >= 2
      ? { timings: shape.timings, amplitudes: shape.amplitudes ?? [] }
      : { duration: shape.duration ?? 8 };

  try {
    bridge.pulse(JSON.stringify(spec));
  } catch {
    // Feedback is decorative; never let it break an interaction.
  }
}
