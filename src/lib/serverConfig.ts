/* SPDX-License-Identifier: GPL-3.0-only */

import { DESKTOP_APP } from './env';

const STORAGE_KEY = 'stay-tuned:server';

/** Build-time default, e.g. VITE_API_BASE=https://radio.example.com */
const BUILD_DEFAULT = (import.meta.env.VITE_API_BASE ?? '').trim();

/**
 * True on a Capacitor build (Android/iOS): native player owns audio and native
 * storage owns the offline cache.
 */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

/**
 * True inside the HarmonyOS ArkWeb shell. It has no Node server (the ArkTS
 * bridge fetches for us) but it plays through the page's <audio> element and
 * caches into IndexedDB, so it must not be treated as a Capacitor build.
 */
export function isHarmonyShell(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as Window & { StayTunedHttp?: unknown }).StayTunedHttp !== 'undefined';
}

/** Any packaged build that has no `/api` server behind it. */
export function isPackagedApp(): boolean {
  return isNativePlatform() || isHarmonyShell();
}

/** Normalize a server address; an empty string means "same origin". */
export function normalizeServerBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : 'http://' + trimmed;
  try {
    const url = new URL(withScheme);
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getServerBase(): string {
  // The desktop shell always serves /api from its own loopback origin. Ignore
  // stale browser/Android localStorage values so user data stays on this origin.
  if (DESKTOP_APP) return '';
  if (typeof window === 'undefined') return BUILD_DEFAULT;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return normalizeServerBase(stored);
  } catch {
    // Private mode or quota errors fall back to the build default.
  }
  return BUILD_DEFAULT;
}

export function setServerBase(value: string): string {
  const normalized = DESKTOP_APP ? '' : normalizeServerBase(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Keep the in-memory behaviour usable even when storage is blocked.
  }
  return normalized;
}

/** Desktop locks the API to its embedded server; browser/Android may configure one. */
export function canConfigureServer(): boolean {
  return !DESKTOP_APP;
}

export function hasServerBase(): boolean {
  return Boolean(getServerBase()) || (!DESKTOP_APP && !isPackagedApp());
}

/** Absolute URL for an API path, honouring the configured server. */
export function apiUrl(path: string): URL {
  const base = getServerBase();
  if (!base) return new URL(path, window.location.origin);
  return new URL(path.replace(/^\/+/, ''), base + '/');
}

/** Turn a relative server response path (e.g. /api/audio?url=) into an absolute URL. */
export function absolutize(url: string): string {
  const base = getServerBase();
  if (!base) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return base + (url.startsWith('/') ? '' : '/') + url;
}
