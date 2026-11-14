/* SPDX-License-Identifier: GPL-3.0-only */

import { useAppStore } from '../state/AppStore';
import { ChapterList } from './EpisodePanel';
import { CoverArt } from './CoverArt';
import { stationImage } from '../lib/stations';
import { Sheet } from './ui/Primitives';
import { formatTime, pad2 } from '../lib/format';

interface ChaptersSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ChaptersSheet({ open, onClose }: ChaptersSheetProps) {
  const { current, stations, currentChapterIndex, playStation, seek, playback } = useAppStore();
  const isRadio = current?.kind === 'radio';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={isRadio ? 'STATIONS' : 'CHAPTERS'}
      title={isRadio ? '切换电台' : '章节'}
      className="chapters-sheet"
    >
      {isRadio ? (
        <div className="station-pick-list">
          {stations.map((station, index) => {
            const active = current?.kind === 'radio' && station.id === current.station.id;
            return (
              <button
                key={station.id}
                type="button"
                className={`station-pick ${active ? 'is-active' : ''}`}
                onClick={() => {
                  playStation(station.id);
                  onClose();
                }}
              >
                <span className="station-pick-index">{pad2(index + 1)}</span>
                <CoverArt kind={station.cover ?? 'signal'} image={stationImage(station)} className="station-pick-art" />
                <span className="station-pick-copy">
                  <span>{station.name}</span>
                  <small>{station.group || station.country || '网络电台'}</small>
                </span>
                {active ? (
                  <span className="station-pick-live">
                    <i /> LIVE
                  </span>
                ) : (
                  <IconChevron />
                )}
              </button>
            );
          })}
        </div>
      ) : current?.kind === 'episode' ? (
        <>
          <div className="sheet-nowline">
            <span>{playback.isPlaying ? '正在播放' : '上次听到'}</span>
            <strong>{current.episode.title}</strong>
            <span className="mono">
              {formatTime(current.episode.chapters?.[currentChapterIndex]?.start ?? 0)}
            </span>
          </div>
          <ChapterList episode={current.episode} />
          {current.episode.chapters?.length ? (
            <button
              type="button"
              className="sheet-ghost-button"
              onClick={() => {
                seek(0);
                onClose();
              }}
            >
              从头开始
            </button>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 5.5 6.5 6.5L9 18.5" />
    </svg>
  );
}
