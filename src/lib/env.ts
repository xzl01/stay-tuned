/* SPDX-License-Identifier: GPL-3.0-only */

/** GitHub Pages build: static shell with demo-only network capabilities. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/** Electron shell: the Node API is embedded on a fixed loopback origin. */
export const DESKTOP_APP = typeof window !== 'undefined' &&
  Boolean((window as Window & { StayTunedDesktop?: { isDesktop?: boolean } }).StayTunedDesktop?.isDesktop);

/** Resolve a file from public/ for both root and sub-path deployments. */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}
