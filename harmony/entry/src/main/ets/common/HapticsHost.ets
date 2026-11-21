/* SPDX-License-Identifier: GPL-3.0-only */

import { vibrator } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTunedHaptics';

/** Mirrors the Android cue shapes: either a single pulse or an on/off pattern. */
interface HapticSpec {
  duration?: number;
  pattern?: number[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Tactile feedback for the faders, buttons and the five-second easter egg.
 *
 * ArkWeb has no vibration API, so the page forwards the same cue vocabulary it
 * already uses on Android and this class plays it on the linear motor. The
 * system's touch-feedback switch still applies, because every call goes out with
 * `usage: 'touch'`.
 */
export class HapticsHost {
  pulse(specJson: string): void {
    let spec: HapticSpec = {};
    try {
      spec = JSON.parse(specJson) as HapticSpec;
    } catch (error) {
      return;
    }

    const attribute: vibrator.VibrateAttribute = { id: 0, usage: 'touch' };
    const pattern = spec.pattern;
    try {
      if (pattern && pattern.length >= 2) {
        // 400 ms per segment is already far past a "tick"; longer values are
        // almost always a bug in the cue table.
        const sanitized: number[] = pattern.map((value: number) => clamp(value, 0, 400));
        vibrator.startVibration({ type: 'pattern', pattern: sanitized }, attribute)
          .catch((error: BusinessError) => {
            hilog.warn(DOMAIN, TAG, 'pattern vibration failed: %{public}d', error.code);
          });
        return;
      }

      const duration = clamp(spec.duration ?? 8, 1, 400);
      vibrator.startVibration({ type: 'time', duration: duration }, attribute)
        .catch((error: BusinessError) => {
          hilog.warn(DOMAIN, TAG, 'vibration failed: %{public}d', error.code);
        });
    } catch (error) {
      const failure = error as BusinessError;
      hilog.warn(DOMAIN, TAG, 'vibrator unavailable: %{public}s', JSON.stringify(failure));
    }
  }
}
