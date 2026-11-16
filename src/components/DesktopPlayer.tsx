/* SPDX-License-Identifier: GPL-3.0-only */

import { useState } from 'react';
import { useAppStore } from '../state/AppStore';
import { DesktopHeader } from './Header';
import { Receiver } from './Receiver';
import { EpisodePanel } from './EpisodePanel';
import { Transport } from './Transport';
import { CurrentChapterRow } from './CurrentChapterRow';
import { ChaptersSheet } from './ChaptersSheet';

interface DesktopPlayerProps {
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
  onOpenSettings: () => void;
}

export function DesktopPlayer({ onOpenLibrary, onOpenQueue, onOpenSettings }: DesktopPlayerProps) {
  const { current, playback } = useAppStore();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const episodeLabel =
    current?.kind === 'episode'
      ? `EP.${String(current.episode.episodeNumber ?? 1).padStart(3, '0')}`
      : current?.kind === 'radio'
        ? 'LIVE'
        : 'EP.—';

  return (
    <div className="desktop-app">
      <DesktopHeader onOpenLibrary={onOpenLibrary} onOpenQueue={onOpenQueue} onOpenSettings={onOpenSettings} />
      <main className="desktop-stage" id="now-playing">
        <section className={`player-card ${playback.isPlaying ? 'is-playing' : ''}`} aria-label="播客播放器">
          <div className="desktop-columns">
            <div className="desktop-left">
              <div className="card-topline">
                <div className="topline-left">
                  <span className="listen-status">
                    <i className={playback.isPlaying ? 'is-live' : ''} aria-hidden="true" />
                    正在收听
                  </span>
                  <span className="topline-rule" aria-hidden="true" />
                  <span className="topline-episode">{episodeLabel}</span>
                </div>
              </div>

              <Receiver variant="desktop" onOpenQueue={onOpenQueue} />
              <CurrentChapterRow variant="desktop" onOpen={() => setChaptersOpen(true)} />
            </div>
            <div className="desktop-right">
              <EpisodePanel />
            </div>
          </div>

          <div className="desktop-bottom">
            <Transport variant="desktop" />
          </div>
        </section>
      </main>
      <ChaptersSheet open={chaptersOpen} onClose={() => setChaptersOpen(false)} />
    </div>
  );
}
