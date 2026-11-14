/* SPDX-License-Identifier: GPL-3.0-only */

import type { Chapter, TranscriptLine } from '../types';

export function chapterIndexAt(chapters: Chapter[] | undefined, time: number): number {
  if (!chapters?.length) return 0;
  let index = 0;
  for (let i = 0; i < chapters.length; i += 1) {
    if (time >= chapters[i].start) index = i;
    else break;
  }
  return index;
}

export function transcriptIndexAt(lines: TranscriptLine[] | undefined, time: number): number {
  if (!lines?.length) return -1;
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (time >= lines[i].start) index = i;
    else break;
  }
  return index;
}

export function chapterEnd(chapters: Chapter[] | undefined, index: number, duration: number): number {
  if (!chapters?.length) return duration;
  return chapters[index + 1]?.start ?? duration;
}

export function nextChapterStart(chapters: Chapter[] | undefined, time: number): number | null {
  if (!chapters?.length) return null;
  const next = chapters.find((chapter) => chapter.start > time + 1);
  return next ? next.start : null;
}

export function isChapterActive(chapter: Chapter, chapters: Chapter[] | undefined, time: number): boolean {
  const index = chapters?.indexOf(chapter) ?? -1;
  return index >= 0 && chapterIndexAt(chapters, time) === index;
}
