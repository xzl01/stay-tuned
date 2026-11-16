/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useState } from 'react';
import { useAppStore } from '../state/AppStore';
import { MobileHeader } from './Header';
import { Receiver } from './Receiver';
import { Transport } from './Transport';
import { CoverArt } from './CoverArt';
import { Icon } from './Icon';
import { Sheet, Switch } from './ui/Primitives';
import { TranscriptList } from './EpisodePanel';
import { CurrentChapterRow } from './CurrentChapterRow';
import { ChaptersSheet } from './ChaptersSheet';
import { balanceHeadline } from '../lib/format';
import { showDisplayTitle } from '../lib/shows';
import { stationImage } from '../lib/stations';
import { LiveSpectrum } from './LiveSpectrum';

interface MobilePlayerProps {
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
  onOpenSettings: () => void;
}

function MobileTranscriptPreview({ onOpen }: { onOpen: () => void }) {
  const { current, currentTranscriptIndex, playback } = useAppStore();
  if (!current) {
    return (
      <button type="button" className="mobile-transcript-card" onClick={onOpen}>
        <span className="mobile-transcript-head">
          <span className="mobile-transcript-title">文字稿</span>
          <span className="mobile-transcript-more">还没有节目 <Icon name="chevronRight" size={15} /></span>
        </span>
        <span className="mobile-transcript-quote is-muted">调进来一档播客，文字会随着声音出现。</span>
      </button>
    );
  }
  if (current.kind === 'radio') {
    return (
      <div className="mobile-transcript-card mobile-transcript-card--radio">
        <span className="mobile-transcript-head">
          <span className="mobile-transcript-title">正在直播</span>
          <span className="live-badge"><i /> LIVE</span>
        </span>
        <LiveSpectrum bars={32} active={playback.isPlaying} className="mobile-wave" mode="mobile" />
        <span className="mobile-transcript-quote is-muted">直播信号没有逐字稿。此刻的声音只在当下发生。</span>
      </div>
    );
  }
  const active = current.episode.transcript?.[currentTranscriptIndex];
  return (
    <button type="button" className="mobile-transcript-card" onClick={onOpen}>
      <span className="mobile-transcript-head">
        <span className="mobile-transcript-title">文字稿</span>
        <span className="mobile-transcript-more">查看全部 <Icon name="chevronRight" size={15} /></span>
      </span>
      <span className="mobile-transcript-quote">
        {active ? active.text : current.episode.description || '还没有逐字稿，先听听这一期吧。'}
      </span>
    </button>
  );
}

function TranscriptSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, prefs, setFollowTranscript, currentExtraStatus, retryCurrentExtras } = useAppStore();
  const episode = current?.kind === 'episode' ? current.episode : null;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const active = document.querySelector('.sheet-content .transcript-list li.is-active');
      active?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={current?.kind === 'episode' ? showDisplayTitle(current.show) : 'TRANSCRIPT'}
      title="文字稿"
      footer={
        episode ? (
          <div className="transcript-sheet-footer">
            <span className="host-role">跟随播放会自动滚动到当前句</span>
            <Switch checked={prefs.followTranscript} onChange={setFollowTranscript} label="跟随播放" />
          </div>
        ) : null
      }
    >
      {episode ? (
        <TranscriptList
          episode={episode}
          status={currentExtraStatus?.transcript}
          error={currentExtraStatus?.transcriptError}
          onRetry={retryCurrentExtras}
        />
      ) : (
        <p className="muted-copy">当前没有可以显示的文字稿。</p>
      )}
    </Sheet>
  );
}

function MobileHero() {
  const { current, playback } = useAppStore();
  if (!current) {
    return (
      <div className="mobile-hero mobile-hero--empty">
        <div>
          <span className="mobile-hero-eyebrow">STAY TUNED</span>
          <h1>把声音调进来。</h1>
          <p>订阅 RSS 播客，或导入一份 M3U 电台列表。</p>
        </div>
      </div>
    );
  }
  const title = current.kind === 'episode' ? current.episode.title : current.station.name;
  const eyebrow =
    current.kind === 'episode'
      ? `${showDisplayTitle(current.show)} · EP.${String(current.episode.episodeNumber ?? '—').padStart(3, '0')}`
      : `${current.station.group || '网络电台'} · LIVE`;
  return (
    <div className="mobile-hero">
      <CoverArt
        kind={current.kind === 'episode' ? current.show.cover ?? 'arch' : current.station.cover ?? 'signal'}
        image={current.kind === 'episode' ? current.show.image : stationImage(current.station)}
        className="mobile-hero-cover"
        alt=""
        eager
      />
      <div className="mobile-hero-copy">
        <span className="mobile-hero-eyebrow">
          {current.kind === 'radio' ? <i className={`mini-live ${playback.isPlaying ? 'is-live' : ''}`} /> : null}
          {eyebrow}
        </span>
        <h1>{balanceHeadline(title)}</h1>
      </div>
    </div>
  );
}

export function MobilePlayer({ onOpenLibrary, onOpenQueue, onOpenSettings }: MobilePlayerProps) {
  const { current } = useAppStore();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <div className="mobile-app">
      <MobileHeader onOpenLibrary={onOpenLibrary} onOpenSettings={onOpenSettings} />
      <main className="mobile-stage">
        <MobileHero />
        <Receiver variant="mobile" onOpenQueue={onOpenQueue} />
        <CurrentChapterRow variant="mobile" onOpen={() => setChaptersOpen(true)} />
        <MobileTranscriptPreview onOpen={() => setTranscriptOpen(true)} />
        <Transport variant="mobile" onOpenQueue={onOpenQueue} />
        <div className={`mobile-safety ${current ? '' : 'is-empty'}`} aria-hidden="true" />
      </main>

      <ChaptersSheet open={chaptersOpen} onClose={() => setChaptersOpen(false)} />
      <TranscriptSheet open={transcriptOpen} onClose={() => setTranscriptOpen(false)} />
    </div>
  );
}
