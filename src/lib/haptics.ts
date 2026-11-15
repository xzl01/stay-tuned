/* SPDX-License-Identifier: GPL-3.0-only */

import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Haptic vocabulary for the physical receiver.
 *
 * `press`/`detent`/`slide`/`dragStart`/`toggle*` go through the permission-free
 * `HapticFeedbackConstants` channel, so the system (and the OEM) tunes strength
 * and honours the user's touch-feedback switch. `lever`/`snap`/`holdTick`/
 * `powerOn` need shaped waveforms and use the custom motor channel instead.
 */
export type HapticCue =
  | 'press'
  | 'lever'
  | 'detent'
  | 'slide'
  | 'snap'
  | 'dragStart'
  | 'toggleOn'
  | 'toggleOff'
  | 'sheetOpen'
  | 'sheetClose'
  | 'success'
  | 'error'
  | 'holdTick'
  | 'powerOn';

export interface HapticsCapabilities {
  hasVibrator: boolean;
  amplitude: boolean;
  apiLevel: number;
  primitives: boolean;
  envelope: boolean;
  touchFeedbackEnabled: boolean;
  /** False when the device cannot play shaped effects (API < 26). */
  custom: boolean;
}

interface HapticsPlugin {
  capabilities(): Promise<HapticsCapabilities>;
  feedback(options: { constant: number }): Promise<{ ok: boolean }>;
  play(options: {
    duration?: number;
    amplitude?: number;
    timings?: number[];
    amplitudes?: number[];
  }): Promise<void>;
}

const Haptics = registerPlugin<HapticsPlugin>('Haptics');

const HAPTICS_PLATFORM = 'android';

function isHapticsPlatform(): boolean {
  return Capacitor.getPlatform() === HAPTICS_PLATFORM;
}

/** HapticFeedbackConstants values; the comment is the API level that added it. */
const K = {
  virtualKey: 1, // 5
  clockTick: 4, // 21
  gestureStart: 12, // 30
  gestureEnd: 13, // 30
  confirm: 16, // 30
  reject: 17, // 30
  toggleOn: 21, // 34
  toggleOff: 22, // 34
  dragStart: 25, // 34
  segmentTick: 26, // 34
  segmentFrequentTick: 27, // 34
} as const;

/** Per-cue throttle, in milliseconds. Dense gestures drop frames instead of queueing. */
const MIN_GAP: Partial<Record<HapticCue, number>> = {
  press: 55,
  detent: 55,
  slide: 85,
  snap: 150,
  sheetOpen: 300,
  sheetClose: 250,
  success: 500,
  error: 500,
  holdTick: 600,
  powerOn: 400,
};

let enabled = true;
/** Flat appearance plays everything one notch lighter. */
let flatMode = false;
let capabilities: HapticsCapabilities | null = null;
let initPromise: Promise<HapticsCapabilities | null> | null = null;
const lastAt = new Map<HapticCue, number>();

/** Probe the motor once; safe to call repeatedly. */
export function initHaptics(): Promise<HapticsCapabilities | null> {
  if (!isHapticsPlatform()) return Promise.resolve(null);
  if (!initPromise) {
    initPromise = Haptics.capabilities()
      .then((result) => {
        capabilities = result;
        return result;
      })
      .catch(() => null);
  }
  return initPromise;
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function setHapticsMode(mode: 'skeuo' | 'flat'): void {
  flatMode = mode === 'flat';
}

type ConstantCue = HapticCue | 'confirm' | 'reject';

function constantFor(cue: ConstantCue): number {
  const api = capabilities?.apiLevel ?? 30;
  switch (cue) {
    case 'dragStart':
      if (flatMode) return api >= 30 ? K.gestureStart : K.clockTick;
      return api >= 34 ? K.dragStart : api >= 30 ? K.gestureStart : K.clockTick;
    case 'detent':
      return api >= 34 ? K.segmentTick : K.clockTick;
    case 'slide':
      return api >= 34 ? K.segmentFrequentTick : K.clockTick;
    case 'toggleOn':
      return api >= 34 ? K.toggleOn : K.virtualKey;
    case 'toggleOff':
      return api >= 34 ? K.toggleOff : K.virtualKey;
    case 'confirm':
      return api >= 30 ? K.confirm : K.virtualKey;
    case 'reject':
      return api >= 30 ? K.reject : K.virtualKey;
    default:
      return flatMode && api >= 30 ? K.gestureStart : K.virtualKey;
  }
}

/** Cues that need shaped waveforms; null means "use a system constant". */
function customPattern(
  cue: HapticCue,
  amplitude?: number,
): Parameters<HapticsPlugin['play']>[0] | null {
  switch (cue) {
    case 'lever':
      // Two-stage throw, like a mechanical lever settling into place.
      return { timings: [0, 8, 26, 14], amplitudes: [0, 200, 70, 0] };
    case 'snap':
      // Double notch: the detent catching.
      return { timings: [0, 6, 26, 6], amplitudes: [0, 180, 0, 130] };
    case 'detent':
      // 65 ms system TICK smears into a buzz while dragging; a short pulse reads
      // as a mechanical notch instead.
      return { duration: 7, amplitude: 110 };
    case 'slide':
      return { duration: 4, amplitude: 55 };
    case 'sheetOpen':
      // Tray settling after the slide-in animation.
      return { timings: [0, 6, 34, 8], amplitudes: [0, 55, 0, 45] };
    case 'sheetClose':
      return { duration: 10, amplitude: 75 };
    case 'success':
      return { timings: [0, 6, 40, 8], amplitudes: [0, 140, 0, 170] };
    case 'error':
      return { timings: [0, 10, 60, 12], amplitudes: [0, 200, 0, 180] };
    case 'holdTick':
      return { duration: 10, amplitude: amplitude ?? 120 };
    case 'powerOn':
      // Warm-up thunk before the valves settle.
      return { timings: [0, 12, 34, 60], amplitudes: [0, 255, 110, 170] };
    default:
      return null;
  }
}

/** Constant fallback for devices that cannot play shaped effects. */
function fallbackConstant(cue: HapticCue): number | null {
  switch (cue) {
    case 'lever':
      return K.virtualKey;
    case 'snap':
      return constantFor('detent');
    case 'detent':
      return constantFor('detent');
    case 'slide':
      return constantFor('slide');
    case 'holdTick':
      return constantFor('detent');
    case 'powerOn':
      return constantFor('confirm');
    case 'sheetOpen':
      return K.gestureStart;
    case 'sheetClose':
      return K.gestureEnd;
    case 'success':
      return constantFor('confirm');
    case 'error':
      return constantFor('reject');
    default:
      return null;
  }
}

/** Scales a custom pattern for the flat appearance without touching the shape. */
function scaledPattern(
  pattern: Parameters<HapticsPlugin['play']>[0],
): Parameters<HapticsPlugin['play']>[0] {
  if (!flatMode) return pattern;
  const scale = (value: number) => Math.max(1, Math.min(255, Math.round(value * 0.7)));
  if (pattern.amplitudes) {
    return { ...pattern, amplitudes: pattern.amplitudes.map(scale) };
  }
  if (pattern.amplitude) {
    return { ...pattern, amplitude: scale(pattern.amplitude) };
  }
  return pattern;
}

export interface HapticOptions {
  /** Only vibrate for touch/pen input when the caller knows the pointer type. */
  pointerType?: string;
  /** 1-255; used by `holdTick` to escalate while the user keeps holding. */
  amplitude?: number;
}

/**
 * Fire one haptic cue. Call this from event handlers only — never from effects —
 * and never await it: the UI must not wait for the motor.
 */
export function pulse(cue: HapticCue, options: HapticOptions = {}): void {
  if (!enabled || !isHapticsPlatform()) return;
  if (document.visibilityState !== 'visible') return;
  if (options.pointerType && options.pointerType !== 'touch' && options.pointerType !== 'pen') {
    return;
  }
  const gap = MIN_GAP[cue] ?? 0;
  const now = performance.now();
  if (gap && now - (lastAt.get(cue) ?? 0) < gap) return;
  lastAt.set(cue, now);

  if (capabilities && !capabilities.hasVibrator) return;

  const custom = customPattern(cue, options.amplitude);
  if (custom && capabilities?.custom !== false) {
    void Haptics.play(scaledPattern(custom)).catch(() => undefined);
    return;
  }
  const fallback = custom ? fallbackConstant(cue) : null;
  const constant = fallback ?? constantFor(cue);
  void Haptics.feedback({ constant }).catch(() => undefined);
}
