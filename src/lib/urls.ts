/* SPDX-License-Identifier: GPL-3.0-only */

/** Canonical, protocol-insensitive key for comparing feed URLs from different directories. */
export function feedUrlKey(raw?: string): string {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}${url.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}
