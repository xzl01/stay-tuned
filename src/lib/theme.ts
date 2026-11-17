/* SPDX-License-Identifier: GPL-3.0-only */

import type { Theme } from '../types';

export const THEME_QUERY = '(prefers-color-scheme: dark)';

/** True when the OS asks for a dark appearance. */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(THEME_QUERY).matches;
}

/** Concrete appearance to render: 'system' collapses to light or dark. */
export function resolveTheme(theme: Theme, systemDark = systemPrefersDark()): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}
