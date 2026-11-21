/* SPDX-License-Identifier: GPL-3.0-only */

import { vibrator } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTunedHaptics';

/**
 * Mirrors the Android cue shapes: a single pulse, or a list of alternating
 * off/on segments with an optional amplitude per segment.
 */
interface HapticSpec {
  duration?: number;
  timings?: number[];
  amplitudes?: number[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Android amplitudes are 1-255; HarmonyOS intensities are 0-100. */
function intensityOf(amplitude: number): number {
  return clamp((amplitude / 255) * 100, 1, 100);
}

/**
 * Tactile feedback for the faders, buttons and the five-second easter egg.
 *
 * ArkWeb has no vibration API, so the page forwards the same cue vocabulary it
 * already uses on Android and this class plays it on the linear motor. Every
 * call goes out with `usage: 'touch'`, so the system touch-feedback switch and
 * the system intensity still apply.
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
    try {
      const pattern = this.buildPattern(spec);
      if (pattern) {
        vibrator.startVibration({ type: 'pattern', pattern: pattern }, attribute)
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

  /**
   * Android timings start with an off segment and alternate, which maps onto
   * absolute event times: odd indices are the vibrate segments.
   */
  private buildPattern(spec: HapticSpec): vibrator.VibratorPattern | undefined {
    const timings = spec.timings;
    if (!timings || timings.length < 2) return undefined;

    const amplitudes = spec.amplitudes ?? [];
    const events: vibrator.VibratorEvent[] = [];
    let cursor = 0;
    for (let index = 0; index < timings.length; index += 1) {
      const segment = clamp(timings[index], 0, 400);
      const vibrating = index % 2 === 1 && segment > 0;
      if (vibrating) {
        const amplitude = amplitudes.length > index ? amplitudes[index] : 200;
        events.push({
          eventType: vibrator.VibratorEventType.CONTINUOUS,
          time: cursor,
          duration: segment,
          intensity: intensityOf(amplitude),
        });
      }
      cursor += segment;
    }

    if (events.length === 0) return undefined;
    return { time: 0, events: events };
  }
}
