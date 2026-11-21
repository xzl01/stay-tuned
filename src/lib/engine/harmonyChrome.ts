/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * HarmonyOS window chrome.
 *
 * The shell paints edge to edge and the page pads with `env(safe-area-inset-*)`,
 * so the status bar icons are drawn on top of the page and have to follow the
 * app's light / dark choice.
 */

interface HarmonyChromeBridge {
  setBars(payloadJson: string): Promise<void>;
}

declare global {
  interface Window {
    StayTunedChrome?: HarmonyChromeBridge;
  }
}

export function isHarmonyChromeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.StayTunedChrome?.setBars === 'function';
}

export function pushSystemBars(dark: boolean): void {
  const bridge = typeof window === 'undefined' ? undefined : window.StayTunedChrome;
  if (!bridge) return;
  void bridge.setBars(JSON.stringify({ dark })).catch(() => undefined);
}
