/* SPDX-License-Identifier: GPL-3.0-only */

import type { CoverKind } from '../types';

const COVER_KINDS: CoverKind[] = ['signal', 'night', 'dune', 'field', 'window', 'ridge'];

export function coverForName(name: string): CoverKind {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_KINDS[hash % COVER_KINDS.length];
}
