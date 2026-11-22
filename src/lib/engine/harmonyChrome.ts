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
    /** Pushed by ChromeHost when the OS light/dark mode changes. */
    __stayTunedSystemDark?: boolean;
  }
}

/**
 * ArkWeb does not reliably expose `prefers-color-scheme`, so the ArkTS side
 * reports the system choice instead. Returns null when there is no answer yet
 * and the media query should be trusted.
 */
export function systemDarkOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  const value = window.__stayTunedSystemDark;
  return typeof value === 'boolean' ? value : null;
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
