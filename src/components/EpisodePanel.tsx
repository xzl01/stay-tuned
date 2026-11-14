/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useRef, useState } from 'react';
import { useAppStore, type ExtraStatus } from '../state/AppStore';
import { CoverArt } from './CoverArt';
import { Icon } from './Icon';
import { Spinner, Switch } from './ui/Primitives';
import { LiveSpectrum } from './LiveSpectrum';
import { balanceHeadline, formatTime, formatDate, pad2 } from '../lib/format';
import { showDisplayTitle } from '../lib/shows';
import { stationImage } from '../lib/stations';
import type { Episode, Show, Station } from '../types';

function FavoriteButton() {
  const { current, isFavorite, toggleFavorite } = useAppStore();
  if (!current) return null;
  const favorite = isFavorite(current.key);
  return (
    <button
      type="button"
      className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
      aria-label={favorite ? '取消收藏' : '收藏'}
      aria-pressed={favorite}
      onClick={() => toggleFavorite(current.key)}
    >
      <Icon name="heart" size={22} filled={favorite} strokeWidth={1.5} />
    </button>
  );
}


function hostLabel(homepage?: string): string {
  if (!homepage) return '公开串流';
  try {
    return new URL(homepage).hostname.replace(/^www\./, '');
  } catch {
    return '公开串流';
  }
}

function EpisodeMeta({ episode }: { episode: Episode }) {
  const parts: string[] = [];
  if (episode.episodeNumber) parts.push(`第 ${episode.episodeNumber} 期`);
  if (episode.pubDate) parts.push(formatDate(episode.pubDate));
  if (episode.duration) parts.push(formatTime(episode.duration));
  return <span className="episode-meta">{parts.join(' · ')}</span>;
}

export function TranscriptList({
  episode,
  compact = false,
  status,
  error,
  onRetry,
}: {
  episode: Episode;
  compact?: boolean;
  status?: ExtraStatus;
  error?: string;
  onRetry?: () => void;
}) {
  const { currentTranscriptIndex, seek, prefs, playback, currentKey } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const didInitialScroll = useRef<string | null>(null);
  const lines = episode.transcript ?? [];
  const activeIndex = currentTranscriptIndex;

  const scrollToActive = (behavior: ScrollBehavior) => {
    const container = scrollRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const top =
      container.scrollTop +
      (activeRect.top - containerRect.top) -
      container.clientHeight * 0.6 +
      activeRect.height / 2;
    container.scrollTo({ top: Math.max(0, top), behavior });
  };

  useEffect(() => {
    if (!prefs.followTranscript || activeIndex < 0) return;
    scrollToActive('smooth');
    // Only react to the active line changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, prefs.followTranscript]);

  useEffect(() => {
    const container = scrollRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    let lastOffset = -1;
    const align = () => {
      if (Math.abs(active.offsetTop - lastOffset) < 1) return;
      lastOffset = active.offsetTop;
      scrollToActive('auto');
    };
    if (didInitialScroll.current !== currentKey) {
      didInitialScroll.current = currentKey;
      lastOffset = active.offsetTop;
      window.requestAnimationFrame(() => scrollToActive('auto'));
    }
    const observer = new ResizeObserver(() => {
      // Fonts, wrapping and the responsive layout can all change line heights
      // after the first paint. Keep the active line in its reading position.
      align();
    });
    observer.observe(container);
    observer.observe(active);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, activeIndex]);

  if (!lines.length) {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className={`transcript-empty is-loading ${compact ? 'is-compact' : ''}`}>
          <Spinner label="正在读取文字稿" />
          <p className="transcript-empty-title">正在读取文字稿…</p>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className={`transcript-empty ${compact ? 'is-compact' : ''}`}>
          <p className="transcript-empty-title">文字稿读取失败</p>
          <p>{error || '这段文字稿暂时不可用。'}</p>
          {onRetry ? (
            <button type="button" className="text-button transcript-retry" onClick={onRetry}>
              重新读取
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className={`transcript-empty ${compact ? 'is-compact' : ''}`}>
        <p className="transcript-empty-title">这期节目还没有逐字稿</p>
        <p>{episode.description || '可以先从节目简介开始了解这一期。'}</p>
      </div>
    );
  }

  return (
    <div className={`transcript-scroll ${compact ? 'is-compact' : ''}`} ref={scrollRef}>
      <ol className="transcript-list">
        {lines.map((line, index) => {
          const active = index === activeIndex;
          return (
            <li key={`${line.start}-${index}`} className={active ? 'is-active' : undefined}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                className="transcript-line"
                aria-current={active ? 'true' : undefined}
                onClick={() => seek(line.start + 0.1)}
              >
                <span className="transcript-time">{formatTime(line.start)}</span>
                <span className="transcript-text">{line.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!playback.isPlaying && activeIndex < 0 ? (
        <button type="button" className="transcript-start" onClick={() => seek(lines[0].start)}>
          从 00:00 开始跟随
        </button>
      ) : null}
    </div>
  );
}

export function ChapterList({
  episode,
  compact = false,
  status,
  error,
  onRetry,
}: {
  episode: Episode;
  compact?: boolean;
  status?: ExtraStatus;
  error?: string;
  onRetry?: () => void;
}) {
  const { playback, seek, currentChapterIndex } = useAppStore();
  const chapters = episode.chapters ?? [];
  if (!chapters.length) {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="chapters-empty is-loading">
          <Spinner label="正在读取章节" />
          <p>正在读取章节…</p>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="chapters-empty">
          <p>章节读取失败</p>
          <span>{error || '章节文件暂时不可用。'}</span>
          {onRetry ? (
            <button type="button" className="text-button transcript-retry" onClick={onRetry}>
              重新读取
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="chapters-empty">
        <p>这期节目没有提供章节标记。</p>
        <span>你仍然可以拖动下方的进度条，找到想听的位置。</span>
      </div>
    );
  }
  return (
    <ol className={`chapter-list ${compact ? 'is-compact' : ''}`}>
      {chapters.map((chapter, index) => {
        const end = chapters[index + 1]?.start ?? episode.duration;
        const active = index === currentChapterIndex;
        const progress =
          active && end > chapter.start
            ? Math.min(100, Math.max(0, ((playback.currentTime - chapter.start) / (end - chapter.start)) * 100))
            : 0;
        return (
          <li key={`${chapter.start}-${chapter.title}`} className={active ? 'is-active' : undefined}>
            <button type="button" onClick={() => seek(chapter.start + 0.05)}>
              <span className="chapter-list-number">{pad2(index + 1)}</span>
              <span className="chapter-list-copy">
                <span className="chapter-list-title">{chapter.title}</span>
                <span className="chapter-list-time">
                  {formatTime(chapter.start)}
                  {end > 0 ? ` — ${formatTime(end)}` : ''}
                </span>
                {active ? <span className="chapter-list-progress" style={{ width: `${progress}%` }} /> : null}
              </span>
              <span className="chapter-list-play" aria-hidden="true">
                <Icon name={active && playback.isPlaying ? 'signal' : 'play'} size={16} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ShowNotes({ episode, show }: { episode: Episode; show: Show }) {
  const text = episode.description || show.description;
  return (
    <div className="show-notes">
      <p>{text || '这期节目没有提供简介。'}</p>
      <div className="show-notes-meta">
        {episode.pubDate ? <span>{formatDate(episode.pubDate)}</span> : null}
        {episode.duration ? <span>{formatTime(episode.duration)}</span> : null}
        {show.siteUrl ? (
          <a href={show.siteUrl} target="_blank" rel="noreferrer noopener">
            访问节目主页 <Icon name="external" size={12} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function EpisodeTabs({
  episode,
  show,
  status,
  onRetry,
}: {
  episode: Episode;
  show: Show;
  status: { chapter: ExtraStatus; transcript: ExtraStatus; chapterError?: string; transcriptError?: string } | null;
  onRetry: () => void;
}) {
  const firstTab: 'transcript' | 'chapters' | 'notes' =
    episode.transcript?.length || episode.transcriptUrl
      ? 'transcript'
      : episode.chapters?.length || episode.chaptersUrl
        ? 'chapters'
        : 'notes';
  const [tab, setTab] = useState<'transcript' | 'chapters' | 'notes'>(firstTab);
  const { currentKey } = useAppStore();

  useEffect(() => setTab(firstTab), [currentKey, firstTab]);

  return (
    <div className="episode-transcript">
      <div className="episode-tabs" role="tablist" aria-label="节目内容">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'notes'}
          className={tab === 'notes' ? 'is-active' : ''}
          onClick={() => setTab('notes')}
        >
          简介
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'transcript'}
          className={tab === 'transcript' ? 'is-active' : ''}
          onClick={() => setTab('transcript')}
        >
          文字稿
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chapters'}
          className={tab === 'chapters' ? 'is-active' : ''}
          onClick={() => setTab('chapters')}
        >
          章节
        </button>
      </div>
      <div className="episode-tab-body" role="tabpanel" aria-label={tab === 'notes' ? '节目简介' : tab === 'transcript' ? '文字稿' : '章节'}>
        {tab === 'notes' ? (
          <ShowNotes episode={episode} show={show} />
        ) : tab === 'transcript' ? (
          <TranscriptList
            episode={episode}
            status={status?.transcript}
            error={status?.transcriptError}
            onRetry={onRetry}
          />
        ) : (
          <ChapterList
            episode={episode}
            status={status?.chapter}
            error={status?.chapterError}
            onRetry={onRetry}
          />
        )}
      </div>
    </div>
  );
}

function FollowFooter({ show }: { show?: Show }) {
  const { prefs, setFollowTranscript } = useAppStore();
  return (
    <div className="episode-footer">
      <span className="host-chip">
        <span className="host-avatar" aria-hidden="true">
          {show?.author?.slice(0, 1) ?? '留'}
        </span>
        <span>
          {show?.author || '留频'} <span className="host-role">· 主播</span>
        </span>
      </span>
      <span className="follow-control">
        <Switch
          checked={prefs.followTranscript}
          onChange={setFollowTranscript}
          label="跟随播放"
        />
      </span>
    </div>
  );
}

function RadioPanel({ station }: { station: Station }) {
  const { playback, isFavorite, toggleFavorite } = useAppStore();
  const favorite = isFavorite(`radio:${station.id}`);
  const country = station.country || '未知地区';
  const codec = station.codec || 'MP3';
  const bitrate = station.bitrate ? `${station.bitrate} kbps` : '自适应';
  return (
    <div className="radio-panel">
      <div className="radio-info-grid">
        <div>
          <span className="radio-info-label">地区</span>
          <span className="radio-info-value">{country}</span>
        </div>
        <div>
          <span className="radio-info-label">类型</span>
          <span className="radio-info-value">{station.group || '网络电台'}</span>
        </div>
        <div>
          <span className="radio-info-label">信号</span>
          <span className="radio-info-value">{codec} · {bitrate}</span>
        </div>
        <div>
          <span className="radio-info-label">状态</span>
          <span className="radio-info-value radio-live-value">
            <i className={playback.isPlaying ? 'is-live' : ''} />
            {playback.isPlaying ? '正在直播' : '信号待命'}
          </span>
        </div>
      </div>
      <p className="radio-note">
        这是一条实时信号。没有固定的节目单，也没有可以拖动的进度条——把这一段时间交给电台，
        让不知道下一首是什么成为收听的一部分。
      </p>
      {station.tags?.length ? (
        <div className="tag-row">
          {station.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      ) : null}
      <div className={`radio-scope ${playback.isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
        <div className="radio-scope-head">
          <span><i /> LIVE SIGNAL</span>
          <span>{codec} · 44.1 kHz</span>
        </div>
        <LiveSpectrum bars={44} active={playback.isPlaying} className="radio-scope-bars" mode="scope" />
        <div className="radio-scope-scale">
          <span>87.5</span>
          <span>98.0</span>
          <span>108.0</span>
        </div>
      </div>
      <div className="radio-actions">
        {station.homepage ? (
          <a href={station.homepage} target="_blank" rel="noreferrer noopener" className="text-link">
            电台主页 <Icon name="external" size={14} />
          </a>
        ) : <span />}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            toggleFavorite(`radio:${station.id}`);
          }}
          aria-pressed={favorite}
        >
          <Icon name="heart" size={15} filled={favorite} /> {favorite ? '已收藏' : '收藏电台'}
        </button>
      </div>
    </div>
  );
}

export function EpisodePanel() {
  const { current, playback, currentExtraStatus, retryCurrentExtras } = useAppStore();

  if (!current) {
    return (
      <section className="episode-panel episode-panel--empty">
        <div className="episode-empty-art">
          <CoverArt kind="signal" />
        </div>
        <h1>把下一段声音调进来</h1>
        <p>订阅一档 RSS 播客，或导入一份 M3U 电台列表。留频会记住你听到的位置。</p>
      </section>
    );
  }

  if (current.kind === 'radio') {
    return (
      <section className="episode-panel episode-panel--radio" aria-label="正在收听的电台">
        <div className="episode-head">
          <CoverArt kind={current.station.cover ?? 'signal'} image={stationImage(current.station)} alt={current.station.name} className="episode-cover" eager />
          <div className="episode-head-copy">
            <span className="episode-show">正在收听 · LIVE</span>
            <h1 className="episode-title">{current.station.name}</h1>
            <span className="episode-meta">
              {current.station.group || '网络电台'}
              {current.station.country ? ` · ${current.station.country}` : ''}
            </span>
          </div>
          <FavoriteButton />
        </div>

        <div className="episode-tabs episode-tabs--single" role="tablist" aria-label="电台内容">
          <button type="button" role="tab" aria-selected="true" className="is-active">电台信息</button>
          <span className="live-badge"><i /> LIVE</span>
        </div>
        <div className="episode-tab-body">
          <RadioPanel station={current.station} />
        </div>
        <div className="episode-footer">
          <span className="host-chip">
            <span className="host-avatar" aria-hidden="true">FM</span>
            <span>信号来源 <span className="host-role">· {hostLabel(current.station.homepage)}</span></span>
          </span>
          <span className="signal-legend">
            <i className={playback.isPlaying ? 'is-live' : ''} />
            {playback.isPlaying ? '实时信号' : '已暂停'}
          </span>
        </div>
      </section>
    );
  }

  const { show, episode } = current;
  return (
    <section className="episode-panel" aria-label="当前节目">
      <div className="episode-head">
        <CoverArt kind={show.cover ?? 'arch'} image={episode.image || show.image} alt={`${showDisplayTitle(show)} 封面`} className="episode-cover" eager />
        <div className="episode-head-copy">
          <span className="episode-show">{showDisplayTitle(show)}</span>
          <h1 className="episode-title">{balanceHeadline(episode.title)}</h1>
          <EpisodeMeta episode={episode} />
        </div>
        <FavoriteButton />
      </div>

      <EpisodeTabs
        episode={episode}
        show={show}
        status={currentExtraStatus}
        onRetry={retryCurrentExtras}
      />
      <FollowFooter show={show} />
    </section>
  );
}
