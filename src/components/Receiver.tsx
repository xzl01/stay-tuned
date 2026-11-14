/* SPDX-License-Identifier: GPL-3.0-only */

import { useContext, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../state/AppStore';
import { formatTime, pad2 } from '../lib/format';
import { Icon } from './Icon';
import { Lcd } from './hardware/Lcd';
import { Fader } from './hardware/Fader';
import { Receiver3DEggContext, usePlayEasterEgg } from '../hooks/usePlayEasterEgg';
import { Receiver3DEasterEgg } from './Receiver3DEasterEgg';

interface ReceiverProps {
  variant: 'desktop' | 'mobile';
  onOpenQueue: () => void;
}

export function Receiver({ variant, onOpenQueue }: ReceiverProps) {
  const {
    current,
    playback,
    prefs,
    currentChapterIndex,
    togglePlay,
    previous,
    next,
    seek,
    setVolume,
  } = useAppStore();
  const [previewChapter, setPreviewChapter] = useState<number | null>(null);
  const playGesture = usePlayEasterEgg(togglePlay);
  const egg = useContext(Receiver3DEggContext);

  const isRadio = current?.kind === 'radio';
  const chapters = useMemo(
    () => (current?.kind === 'episode' ? current.episode.chapters ?? [] : []),
    [current],
  );
  useEffect(() => {
    setPreviewChapter(null);
  }, [current?.key]);

  const displayedChapterIndex =
    previewChapter != null && previewChapter < chapters.length ? previewChapter : currentChapterIndex;
  const activeChapter = chapters[displayedChapterIndex];
  const hasChapterFader = !isRadio && chapters.length > 1;

  const lcdTime = isRadio ? 'LIVE' : formatTime(playback.currentTime);
  const lcdLine = (() => {
    if (isRadio) return current.station.name;
    if (current?.kind === 'episode') return activeChapter?.title || '完整节目';
    return '等待调谐';
  })();
  const lcdIndex = !isRadio && activeChapter ? pad2(displayedChapterIndex + 1) : '';
  const lcdAria = (() => {
    if (!current) return '播放器屏幕：等待调谐';
    const state = playback.isLoading ? '正在加载' : playback.isPlaying ? '正在播放' : '已暂停';
    if (isRadio) return `播放器屏幕：${state}，直播，${current.station.name}`;
    return `播放器屏幕：${state}，${lcdTime}，${lcdIndex ? `第 ${displayedChapterIndex + 1} 章，` : ''}${lcdLine}`;
  })();

  const chapterValueText = isRadio
    ? '直播节目没有章节'
    : hasChapterFader && activeChapter
      ? `第 ${displayedChapterIndex + 1} 章，${activeChapter.title}`
      : '这期节目没有章节标记';

  if (egg?.active && prefs.mode === 'skeuo') {
    return <Receiver3DEasterEgg variant={variant} onClose={egg.close} onOpenQueue={onOpenQueue} />;
  }

  return (
    <div className={`receiver receiver--${variant}`} data-playing={playback.isPlaying ? 'true' : 'false'}>
      <div className="receiver-cabinet">
        <span className="receiver-top-face" aria-hidden="true" />
        <span className="receiver-side receiver-side--left" aria-hidden="true" />
        <span className="receiver-side receiver-side--right" aria-hidden="true" />
        <div className="receiver-face">
          <div className="speaker-zone">
            <div className="speaker-frame">
              <div className="speaker-grille" aria-hidden="true">
                <span className="speaker-sheen" />
              </div>
            </div>
          </div>

          <div className="control-zone">
            <div className="lcd-bezel">
              <Lcd
                isLoading={playback.isLoading}
                isPlaying={playback.isPlaying}
                time={lcdTime}
                index={lcdIndex}
                line={lcdLine}
                ariaLabel={lcdAria}
              />
            </div>

            <div className="fader-stack">
              <Fader
                key={`chapter-${current?.key ?? 'empty'}`}
                label="章节"
                value={hasChapterFader ? displayedChapterIndex : 0}
                min={0}
                max={Math.max(0, chapters.length - 1)}
                step={1}
                disabled={!hasChapterFader}
                variant="chapter"
                ariaLabel="章节"
                valueText={chapterValueText}
                onPreview={(value) => {
                  if (value == null) setPreviewChapter(null);
                  else setPreviewChapter(value);
                }}
                onCommit={(value) => {
                  const chapter = chapters[value];
                  if (chapter) seek(chapter.start + 0.05);
                }}
              />
              <Fader
                label="音量"
                icon="volume"
                value={Math.round(prefs.volume * 100)}
                min={0}
                max={100}
                step={1}
                variant="volume"
                ariaLabel="音量"
                valueText={`音量 ${Math.round(prefs.volume * 100)}%`}
                onChange={(value) => setVolume(value / 100)}
              />
            </div>

            <div className="receiver-keys">
              <button type="button" className="rx-key" onClick={previous} aria-label="上一段" title="上一段">
                <Icon name="skipBack" size={17} />
              </button>
              <button
                type="button"
                className="rx-key rx-key--play"
                {...playGesture}
                aria-label={playback.isPlaying ? '暂停' : '播放'}
                title={playback.isPlaying ? '暂停' : '播放'}
                data-testid="receiver-play"
              >
                {playback.isLoading ? (
                  <span className="rx-spinner" aria-hidden="true" />
                ) : (
                  <Icon name={playback.isPlaying ? 'pause' : 'play'} size={19} />
                )}
              </button>
              <button type="button" className="rx-key" onClick={next} aria-label="下一段" title="下一段">
                <Icon name="skipForward" size={17} />
              </button>
              <button
                type="button"
                className="rx-key rx-key--menu"
                onClick={onOpenQueue}
                aria-label="打开播放队列"
                title="播放队列"
              >
                <Icon name="list" size={17} />
              </button>
            </div>
          </div>
        </div>

        <div className="receiver-footer">
          <span className="receiver-brand">留频</span>
          <span className="receiver-edition">PODCAST RECEIVER / 01</span>
        </div>
      </div>
      <div className="receiver-feet" aria-hidden="true">
        <i />
        <i />
      </div>
    </div>
  );
}
