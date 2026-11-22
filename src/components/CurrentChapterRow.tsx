/* SPDX-License-Identifier: GPL-3.0-only */

import type { Ref } from 'react';
import { useAppStore } from '../state/AppStore';
import { Icon } from './Icon';
import { pad2 } from '../lib/format';

interface CurrentChapterRowProps {
  onOpen: () => void;
  variant: 'desktop' | 'mobile';
  /** 供一镜到底定位源卡片；不影响布局。 */
  buttonRef?: Ref<HTMLButtonElement>;
}

export function CurrentChapterRow({ onOpen, variant, buttonRef }: CurrentChapterRowProps) {
  const { current, currentChapterIndex } = useAppStore();

  if (!current) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={`current-chapter current-chapter--${variant}`}
        onClick={onOpen}
      >
        <span className="current-chapter-kicker">当前章节</span>
        <span className="current-chapter-value is-empty">还没有开始收听</span>
        <Icon name="chevronRight" size={19} />
      </button>
    );
  }

  if (current.kind === 'radio') {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={`current-chapter current-chapter--${variant}`}
        onClick={onOpen}
        aria-label={`当前电台：${current.station.name}，查看电台列表`}
      >
        <span className="current-chapter-kicker">当前电台</span>
        <span className="current-chapter-value">{current.station.name}</span>
        <Icon name="chevronRight" size={19} />
      </button>
    );
  }

  const chapters = current.episode.chapters ?? [];
  const chapter = chapters[currentChapterIndex];
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`current-chapter current-chapter--${variant}`}
      onClick={onOpen}
      aria-label={
        chapter
          ? `当前章节：第 ${currentChapterIndex + 1} 章，${chapter.title}`
          : '当前节目没有章节标记，查看节目信息'
      }
    >
      <span className="current-chapter-kicker">当前章节</span>
      <span className="current-chapter-value">
        {chapter ? (
          <>
            <span className="current-chapter-number">{pad2(currentChapterIndex + 1)}</span>
            <span>{chapter.title}</span>
          </>
        ) : (
          '完整节目'
        )}
      </span>
      <Icon name="chevronRight" size={19} />
    </button>
  );
}
