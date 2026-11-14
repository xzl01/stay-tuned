/* SPDX-License-Identifier: GPL-3.0-only */

import type { Show } from '../types';

/** A subscription's user-facing name: manual rename wins over the feed title. */
export function showDisplayTitle(show?: Pick<Show, 'title' | 'customTitle'> | null): string {
  const custom = show?.customTitle?.trim();
  return custom || show?.title || '未命名订阅';
}
