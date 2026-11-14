/* SPDX-License-Identifier: GPL-3.0-only */

import { useState } from 'react';
import { useAppStore } from '../state/AppStore';
import { resolvePlayable } from '../lib/refs';
import { Sheet } from './ui/Primitives';
import { CoverArt } from './CoverArt';
import { Icon } from './Icon';
import { formatTime } from '../lib/format';
import { showDisplayTitle } from '../lib/shows';
import { stationImage } from '../lib/stations';

interface QueueSheetProps {
  open: boolean;
  onClose: () => void;
  onBrowse: () => void;
}

export function QueueSheet({ open, onClose, onBrowse }: QueueSheetProps) {
  const {
    queue,
    shows,
    stations,
    currentKey,
    playback,
    playRef,
    removeFromQueue,
    clearQueue,
    moveQueueItem,
  } = useAppStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const items = queue
    .map((entry) => ({ entry, playable: resolvePlayable(entry.ref, shows, stations) }))
    .filter((item): item is { entry: (typeof queue)[number]; playable: NonNullable<ReturnType<typeof resolvePlayable>> } => Boolean(item.playable));

  return (
    <Sheet
      open={open}
      onClose={() => {
        setConfirmClear(false);
        onClose();
      }}
      eyebrow="UP NEXT"
      title="播放队列"
      className="queue-sheet"
      footer={
        <div className="queue-footer">
          <span>{queue.length} 项 · 保存于本机</span>
          <span className="mono">{currentKey ? 'FOLLOWING PLAYBACK' : 'IDLE'}</span>
        </div>
      }
    >
      <div className="queue">
        <div className="queue-toolbar">
          <span className="queue-summary">
            <i className={playback.isPlaying ? 'is-live' : ''} />
            {playback.isPlaying ? '正在按队列播放' : '队列已暂停'}
          </span>
          {queue.length ? (
            confirmClear ? (
              <span className="clear-actions">
                <button type="button" onClick={() => setConfirmClear(false)}>保留</button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => {
                    clearQueue();
                    setConfirmClear(false);
                  }}
                >
                  清空
                </button>
              </span>
            ) : (
              <button type="button" className="text-button" onClick={() => setConfirmClear(true)}>
                <Icon name="trash" size={14} /> 清空
              </button>
            )
          ) : null}
        </div>

        {items.length ? (
          <ol className="queue-list">
            {items.map(({ entry, playable }, index) => {
              const active = entry.key === currentKey;
              const title = playable.kind === 'episode' ? playable.episode.title : playable.station.name;
              const meta =
                playable.kind === 'episode'
                  ? `${showDisplayTitle(playable.show)}${playable.episode.duration ? ` · ${formatTime(playable.episode.duration)}` : ''}`
                  : `${playable.station.group || '网络电台'} · LIVE`;
              return (
                <li key={entry.key} className={active ? 'is-active' : ''}>
                  <span className="queue-index">
                    {active ? (
                      <span className="queue-eq" aria-label="正在播放">
                        <i /><i /><i />
                      </span>
                    ) : (
                      String(index + 1).padStart(2, '0')
                    )}
                  </span>
                  <button
                    type="button"
                    className="queue-item-main"
                    onClick={() => {
                      playRef(entry.ref);
                      onClose();
                    }}
                  >
                    <CoverArt
                      kind={
                        playable.kind === 'episode'
                          ? playable.show.cover ?? 'arch'
                          : playable.station.cover ?? 'signal'
                      }
                      image={playable.kind === 'episode' ? playable.show.image : stationImage(playable.station)}
                      className="queue-art"
                    />
                    <span className="queue-copy">
                      <span className="queue-title">{title}</span>
                      <span className="queue-meta">{meta}</span>
                    </span>
                    {playable.kind === 'radio' ? <span className="queue-live-badge"><i /> LIVE</span> : null}
                  </button>
                  <span className="queue-actions">
                    <button
                      type="button"
                      className="queue-icon-button"
                      aria-label="上移"
                      disabled={index === 0}
                      onClick={() => moveQueueItem(entry.key, -1)}
                    >
                      <Icon name="arrowUp" size={14} />
                    </button>
                    <button
                      type="button"
                      className="queue-icon-button"
                      aria-label="下移"
                      disabled={index === items.length - 1}
                      onClick={() => moveQueueItem(entry.key, 1)}
                    >
                      <Icon name="arrowDown" size={14} />
                    </button>
                    <button
                      type="button"
                      className="queue-icon-button queue-remove"
                      aria-label="从队列移除"
                      onClick={() => removeFromQueue(entry.key)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="queue-empty">
            <span className="queue-empty-icon" aria-hidden="true">
              <Icon name="queue" size={25} />
            </span>
            <h3>队列还是空的</h3>
            <p>从订阅里挑一期节目，或者把一个电台排进来。</p>
            <button
              type="button"
              className="solid-button"
              onClick={() => {
                onClose();
                onBrowse();
              }}
            >
              <Icon name="library" size={15} /> 打开我的订阅
            </button>
          </div>
        )}

        <div className="queue-note">
          <span className="mono">QUEUE {String(queue.length).padStart(2, '0')}</span>
          <span>播放时会自动按顺序继续，节目结束后进入下一段。</span>
        </div>
      </div>
    </Sheet>
  );
}
