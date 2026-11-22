/* SPDX-License-Identifier: GPL-3.0-only */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNativePlatform } from '../serverConfig';

/**
 * System bar insets on Android.
 *
 * The app draws edge to edge, but a WebView reports `env(safe-area-inset-*)` as
 * 0, so the page cannot know where the clock or the gesture bar is. The native
 * side reports the real values and we expose them as CSS variables; the page
 * keeps painting its own textured background behind the bars instead of leaving
 * a flat native strip that reads as a seam.
 */

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface LayoutPlugin {
  get(): Promise<Insets>;
  addListener(event: 'insets', listener: (data: Insets) => void): Promise<PluginListenerHandle>;
}

const Layout = registerPlugin<LayoutPlugin>('Layout');

function applyInsets(insets: Insets): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const value = (input: number): string => `${Math.max(0, Math.round(Number(input) || 0))}px`;
  root.style.setProperty('--safe-top', value(insets.top));
  root.style.setProperty('--safe-bottom', value(insets.bottom));
  root.style.setProperty('--safe-left', value(insets.left));
  root.style.setProperty('--safe-right', value(insets.right));
}

let installed = false;

export function installSystemInsets(): void {
  if (installed || !isNativePlatform()) return;
  installed = true;
  void Layout.get()
    .then(applyInsets)
    .catch(() => undefined);
  void Layout.addListener('insets', applyInsets).catch(() => undefined);
}
