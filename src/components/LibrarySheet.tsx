/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Episode, PodcastSearchResult, Show, Station } from '../types';
import { useAppStore } from '../state/AppStore';
import { fetchFeed, fetchPlaylist, featuredRadio, parsePlaylistText, searchPodcasts, searchRadio } from '../lib/api';
import { CoverArt } from './CoverArt';
import { Icon } from './Icon';
import { Sheet, Spinner } from './ui/Primitives';
import { formatRelativeDate, formatTime, pad2 } from '../lib/format';
import { coverForName } from '../lib/covers';
import { feedUrlKey } from '../lib/urls';
import { findPlayableByKey } from '../lib/refs';
import { showDisplayTitle } from '../lib/shows';
import { stationImage } from '../lib/stations';
import { imageFileToDataUrl } from '../lib/images';
import { getServerBase, isNativePlatform } from '../lib/serverConfig';

interface LibrarySheetProps {
  open: boolean;
  onClose: () => void;
  onOpenServer: () => void;
}

type Tab = 'podcast' | 'radio' | 'favorites';

function normalizeShow(show: Show): Show {
  return {
    ...show,
    episodes: (show.episodes ?? []).map((episode) => ({
      ...episode,
      chapters: Array.isArray(episode.chapters) ? episode.chapters : undefined,
      transcript: Array.isArray(episode.transcript) ? episode.transcript : undefined,
      transcriptUrl: typeof episode.transcriptUrl === 'string' ? episode.transcriptUrl : undefined,
    })),
  };
}

function derivePlaylistName(raw: string): string {
  try {
    const url = new URL(raw);
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    const file = last.replace(/\.(m3u8?|pls)$/i, '').trim();
    return file || url.hostname || '导入的电台';
  } catch {
    return '导入的电台';
  }
}

function AddPodcastForm({ onDone }: { onDone: () => void }) {
  const { addShow } = useAppStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const { show } = await fetchFeed(trimmed);
      addShow(normalizeShow(show));
      setUrl('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取订阅源失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-feed-form" onSubmit={submit}>
      <label className="field-label" htmlFor="rss-url">
        RSS / Atom 订阅地址
      </label>
      <div className="field-row">
        <input
          id="rss-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://feeds.example.com/podcast.xml"
          disabled={busy}
          autoFocus
        />
        <button type="submit" className="solid-button" disabled={busy || !url.trim()}>
          {busy ? <Spinner label="读取中" /> : <Icon name="rss" size={16} />}
          {busy ? '读取中' : '订阅'}
        </button>
      </div>
      <p className="field-hint">支持 RSS 2.0 / Atom。粘贴播客客户端里「复制 RSS 链接」得到的那一串地址。</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}

function ImportPlaylistForm({ onDone }: { onDone: () => void }) {
  const { addStations, notify } = useAppStore();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const importFromFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      const stations = await parsePlaylistText(text);
      const typedName = name.trim();
      const fallbackName = file.name.replace(/\.[^.]+$/, '').trim() || '导入的电台';
      const single = stations.length === 1;
      const importName = typedName || (!single ? fallbackName : '');
      const stationsToAdd = single
        ? [{ ...stations[0], name: typedName || stations[0].name }]
        : stations;
      const added = addStations(
        stationsToAdd,
        single ? undefined : { playlistName: importName },
      );
      notify(
        added
          ? single
            ? `已导入《${stationsToAdd[0].name}》。`
            : `已从文件导入 ${added} 个电台到《${importName}》。`
          : '这些电台已经在列表里了。',
        added ? 'success' : 'default',
      );
      setName('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 M3U 文件失败。');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const { stations } = await fetchPlaylist(trimmed);
      const typedName = name.trim();
      const single = stations.length === 1;
      const importName = typedName || derivePlaylistName(trimmed);
      const stationsToAdd = single
        ? [{ ...stations[0], name: typedName || stations[0].name }]
        : stations;
      const added = addStations(
        stationsToAdd,
        single ? undefined : { playlistName: importName },
      );
      notify(
        added
          ? single
            ? `已导入《${stationsToAdd[0].name}》。`
            : `已导入 ${added} 个电台到《${importName}》。`
          : '这些电台已经在列表里了。',
        added ? 'success' : 'default',
      );
      setUrl('');
      setName('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 M3U 失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-feed-form" onSubmit={submit}>
      <label className="field-label" htmlFor="m3u-name">
        播放列表 / 电台名称（可选）
      </label>
      <div className="field-row field-name-row">
        <input
          id="m3u-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：深夜电台、通勤收藏"
          disabled={busy}
          maxLength={120}
          autoFocus
        />
      </div>
      <label className="field-label" htmlFor="m3u-url">
        M3U 播放列表 / 电台流地址
      </label>
      <div className="field-row">
        <input
          id="m3u-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/radio.m3u"
          disabled={busy}
        />
        <button type="submit" className="solid-button" disabled={busy || !url.trim()}>
          {busy ? <Spinner label="导入中" /> : <Icon name="plus" size={16} />}
          {busy ? '导入中' : '导入'}
        </button>
      </div>
      <div className="field-file-row">
        <button type="button" className="text-button" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="plus" size={14} /> 从本地 .m3u 文件导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".m3u,.m3u8,application/vnd.apple.mpegurl,audio/x-mpegurl,text/plain"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFromFile(file);
          }}
        />
      </div>
      <p className="field-hint">支持扩展 M3U（含 group-title / tvg-logo）、单条 HLS 串流，以及直接的音频流地址。单个电台会直接用名称命名；多个电台会作为播放列表名称。</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}

function PodcastEpisodeRow({
  show,
  episode,
  fallbackNumber,
  onPlayed,
}: {
  show: Show;
  episode: Episode;
  fallbackNumber: number;
  onPlayed: () => void;
}) {
  const { playEpisode, addToQueue, isQueued, current, notify, positions } = useAppStore();
  const active = current?.kind === 'episode' && current.episode.id === episode.id;
  const queued = isQueued({ kind: 'episode', showId: show.id, episodeId: episode.id });
  const episodeKey = `episode:${show.id}:${episode.id}`;
  const saved = positions[episodeKey] ?? 0;
  const completed = episode.duration > 0 && saved >= Math.max(episode.duration - 10, 1);
  const inProgress = saved >= 5 && !completed;
  const progress = episode.duration > 0 ? Math.min(100, (saved / episode.duration) * 100) : 0;
  const status = completed ? '已听完' : inProgress ? `已听 ${formatTime(saved)}` : '';

  return (
    <div className={`library-episode ${active ? 'is-active' : ''} ${completed ? 'is-finished' : ''}`}>
      <button
        type="button"
        className="library-episode-main"
        onClick={() => {
          playEpisode(show.id, episode.id);
          onPlayed();
        }}
      >
        <span className="library-episode-index">
          {active ? (
            <Icon name="signal" size={14} />
          ) : completed ? (
            <Icon name="check" size={13} />
          ) : (
            pad2(episode.episodeNumber ?? fallbackNumber)
          )}
        </span>
        <span className="library-episode-copy">
          <span className="library-episode-title">{episode.title}</span>
          <span className="library-episode-meta">
            {formatRelativeDate(episode.pubDate)}
            {episode.duration ? ` · ${formatTime(episode.duration)}` : ''}
            {status ? ` · ${status}` : ''}
            {active ? ' · 正在收听' : ''}
          </span>
          {inProgress || completed ? (
            <span className={`library-episode-progress ${completed ? 'is-complete' : ''}`} aria-hidden="true">
              <i style={{ width: `${progress}%` }} />
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className={`library-episode-queue ${queued ? 'is-queued' : ''}`}
        aria-label={queued ? '已在播放队列' : '加入播放队列'}
        onClick={() => {
          if (queued) {
            notify('这期节目已经在播放队列里了。');
            return;
          }
          addToQueue({ kind: 'episode', showId: show.id, episodeId: episode.id });
          notify('已加入播放队列。', 'success');
        }}
      >
        <Icon name={queued ? 'check' : 'plus'} size={15} />
      </button>
    </div>
  );
}

function PodcastLibraryItem({
  show,
  expanded,
  onToggle,
  confirmRemove,
  onRequestRemove,
  onRemove,
  onPlayed,
  onRefresh,
  refreshing,
}: {
  show: Show;
  expanded: boolean;
  onToggle: () => void;
  confirmRemove: boolean;
  onRequestRemove: () => void;
  onRemove: () => void;
  onPlayed: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { renameShow } = useAppStore();
  const latest = show.episodes[0];
  const displayTitle = showDisplayTitle(show);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayTitle);
  const startRename = () => {
    setNameDraft(displayTitle);
    setRenaming(true);
  };
  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    if (!nameDraft.trim()) {
      renameShow(show.id, nameDraft);
      return;
    }
    renameShow(show.id, nameDraft);
    setRenaming(false);
  };
  const sortedEpisodes = useMemo(() => {
    const listed = show.episodes.map((episode, index) => ({ episode, index }));
    listed.sort((a, b) => {
      const at = a.episode.pubDate ? Date.parse(a.episode.pubDate) : NaN;
      const bt = b.episode.pubDate ? Date.parse(b.episode.pubDate) : NaN;
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
        return order === 'newest' ? bt - at : at - bt;
      }
      const an = a.episode.episodeNumber ?? 0;
      const bn = b.episode.episodeNumber ?? 0;
      if (an !== bn) return order === 'newest' ? bn - an : an - bn;
      return order === 'newest' ? a.index - b.index : b.index - a.index;
    });
    return listed.map(({ episode }) => episode);
  }, [show.episodes, order]);

  return (
    <article className={`library-show ${expanded ? 'is-open' : ''}`}>
      <div className="library-show-head">
        <button type="button" className="library-show-main" onClick={onToggle} aria-expanded={expanded}>
          <CoverArt kind={show.cover ?? 'arch'} image={show.image} className="library-show-art" />
          <span className="library-show-copy">
            <span className="library-show-title">{displayTitle}</span>
            <span className="library-show-author">{show.author}</span>
            <span className="library-show-meta">
              {show.episodes.length} 期
              {latest?.pubDate ? ` · 更新于 ${formatRelativeDate(latest.pubDate)}` : ''}
              {show.fetchedAt ? ` · 同步 ${formatRelativeDate(show.fetchedAt)}` : ''}
            </span>
          </span>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={17} className="library-chevron" />
        </button>
        {confirmRemove ? (
          <span className="confirm-remove" role="group" aria-label="确认取消订阅">
            <button type="button" className="confirm-cancel" onClick={onRequestRemove}>取消</button>
            <button type="button" className="confirm-ok" onClick={onRemove}>移除</button>
          </span>
        ) : (
          <>
            <button
              type="button"
              className="library-rename"
              onClick={startRename}
              aria-label={`重命名 ${displayTitle}`}
              title="重命名订阅"
            >
              <Icon name="pencil" size={14} />
            </button>
            {show.feedUrl ? (
              <button
                type="button"
                className="library-refresh"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label={`刷新 ${displayTitle}`}
                title={show.fetchedAt ? `上次同步 ${formatRelativeDate(show.fetchedAt)}` : '刷新订阅'}
              >
                {refreshing ? <Spinner label="刷新中" /> : <Icon name="refresh" size={14} />}
              </button>
            ) : null}
            <button type="button" className="library-remove" onClick={onRequestRemove} aria-label={`取消订阅 ${displayTitle}`}>
              <Icon name="trash" size={15} />
            </button>
          </>
        )}
      </div>
      {renaming ? (
        <form className="library-rename-form" onSubmit={submitRename}>
          <label className="visually-hidden" htmlFor={`rename-${show.id}`}>订阅名称</label>
          <input
            id={`rename-${show.id}`}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRenaming(false);
            }}
            autoFocus
            maxLength={160}
          />
          <button type="submit" className="library-rename-save">保存</button>
          <button type="button" className="library-rename-cancel" onClick={() => setRenaming(false)}>取消</button>
        </form>
      ) : null}
      {expanded ? (
        <div className="library-show-episodes">
          {show.episodes.length ? (
            <>
              <div className="library-episode-toolbar">
                <span>{show.episodes.length} 集 · 已显示全部</span>
                <span className="library-sort" role="group" aria-label="单集排序">
                  <button
                    type="button"
                    className={order === 'newest' ? 'is-active' : ''}
                    aria-pressed={order === 'newest'}
                    onClick={() => setOrder('newest')}
                  >
                    最新
                  </button>
                  <button
                    type="button"
                    className={order === 'oldest' ? 'is-active' : ''}
                    aria-pressed={order === 'oldest'}
                    onClick={() => setOrder('oldest')}
                  >
                    最早
                  </button>
                </span>
              </div>
              {sortedEpisodes.map((episode, index) => (
                <PodcastEpisodeRow
                  key={episode.id}
                  show={show}
                  episode={episode}
                  fallbackNumber={index + 1}
                  onPlayed={onPlayed}
                />
              ))}
            </>
          ) : (
            <p className="muted-copy">这个订阅源暂时没有可播放的单集。</p>
          )}
          {show.siteUrl ? (
            <a className="library-show-link" href={show.siteUrl} target="_blank" rel="noreferrer noopener">
              访问节目主页 <Icon name="external" size={13} />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function FavoritesPane({ onPlayed }: { onPlayed: () => void }) {
  const { favorites, shows, stations, playRef, toggleFavorite } = useAppStore();
  const items = useMemo(
    () =>
      favorites
        .map((key) => ({ key, playable: findPlayableByKey(key, shows, stations) }))
        .filter((item): item is { key: string; playable: NonNullable<ReturnType<typeof findPlayableByKey>> } =>
          Boolean(item.playable),
        ),
    [favorites, shows, stations],
  );

  if (!items.length) {
    return (
      <div className="library-empty favorites-empty">
        <p>还没有收藏内容。</p>
        <span>在节目或电台里点一下心形，喜欢的声音会出现在这里。</span>
      </div>
    );
  }

  return (
    <section className="library-subscribed" aria-label="我的收藏">
      <div className="library-section-title">
        <span>我的收藏</span>
        <span className="mono">{String(items.length).padStart(2, '0')}</span>
      </div>
      <div className="favorites-list">
        {items.map(({ key, playable }) => {
          const isEpisode = playable.kind === 'episode';
          const title = isEpisode ? playable.episode.title : playable.station.name;
          const meta = isEpisode
            ? `${showDisplayTitle(playable.show)}${playable.episode.pubDate ? ` · ${formatRelativeDate(playable.episode.pubDate)}` : ''}`
            : `${playable.station.group || '网络电台'} · LIVE`;
          return (
            <div className="favorite-row" key={key}>
              <button
                type="button"
                className="favorite-main"
                onClick={() => {
                  playRef(playable.ref);
                  onPlayed();
                }}
              >
                <CoverArt
                  kind={isEpisode ? playable.show.cover ?? 'arch' : playable.station.cover ?? 'signal'}
                  image={isEpisode ? playable.show.image : stationImage(playable.station)}
                  className="favorite-art"
                />
                <span className="favorite-copy">
                  <span className="favorite-title">{title}</span>
                  <span className="favorite-meta">{meta}</span>
                </span>
                {!isEpisode ? <span className="queue-live-badge"><i /> LIVE</span> : null}
                <Icon name="play" size={15} />
              </button>
              <button
                type="button"
                className="favorite-remove"
                onClick={() => toggleFavorite(key)}
                aria-label={`取消收藏 ${title}`}
              >
                <Icon name="heart" size={15} filled />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface StationPlaylistGroupData {
  id: string;
  name: string;
  stations: Station[];
}

function LibraryStationRow({
  station,
  active,
  confirmRemove,
  onRequestRemove,
  onRemove,
  onPlay,
}: {
  station: Station;
  active: boolean;
  confirmRemove: boolean;
  onRequestRemove: () => void;
  onRemove: () => void;
  onPlay: () => void;
}) {
  const { renameStation, setStationCover } = useAppStore();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(station.name);
  const [editingCover, setEditingCover] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const coverFileRef = useRef<HTMLInputElement>(null);

  const startCoverEdit = () => {
    setCoverUrl('');
    setCoverError('');
    setEditingCover(true);
  };
  const importCoverFile = async (file: File) => {
    setCoverBusy(true);
    setCoverError('');
    try {
      const image = await imageFileToDataUrl(file);
      setStationCover(station.id, image);
      setEditingCover(false);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : '读取图片失败。');
    } finally {
      setCoverBusy(false);
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
  };
  const applyCoverUrl = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = coverUrl.trim();
    if (!trimmed) {
      setCoverError('请输入图片地址。');
      return;
    }
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:image/')) {
      setCoverError('请输入 http(s) 图片地址。');
      return;
    }
    setStationCover(station.id, trimmed);
    setEditingCover(false);
  };

  const startRename = () => {
    setNameDraft(station.name);
    setRenaming(true);
  };
  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    if (!nameDraft.trim()) {
      renameStation(station.id, nameDraft);
      return;
    }
    renameStation(station.id, nameDraft);
    setRenaming(false);
  };

  return (
    <>
      <div className={`library-station ${active ? 'is-active' : ''}`}>
        <button type="button" className="library-station-main" onClick={onPlay}>
          <CoverArt kind={station.cover ?? coverForName(station.name)} image={stationImage(station)} className="library-station-art" />
          <span className="library-station-copy">
            <span className="library-station-title">{station.name}</span>
            <span className="library-station-meta">
              {station.group || '网络电台'}
              {station.bitrate ? ` · ${station.bitrate} kbps` : ''}
              {active ? ' · 正在收听' : ''}
            </span>
          </span>
          {active ? <span className="station-pick-live"><i /> LIVE</span> : <Icon name="play" size={16} />}
        </button>
        <button
          type="button"
          className="library-rename library-station-cover"
          onClick={startCoverEdit}
          aria-label={`更换 ${station.name} 的封面`}
          title="更换封面"
        >
          <Icon name="image" size={14} />
        </button>
        <button
          type="button"
          className="library-rename library-station-rename"
          onClick={startRename}
          aria-label={`重命名电台 ${station.name}`}
          title="重命名电台"
        >
          <Icon name="pencil" size={14} />
        </button>
        <button
          type="button"
          className="library-remove"
          onClick={() => {
            if (confirmRemove) onRemove();
            else onRequestRemove();
          }}
          aria-label={confirmRemove ? '确认移除' : `移除 ${station.name}`}
        >
          {confirmRemove ? <span className="remove-confirm-text">确认</span> : <Icon name="trash" size={15} />}
        </button>
      </div>
      {renaming ? (
        <form className="library-rename-form library-station-rename-form" onSubmit={submitRename}>
          <label className="visually-hidden" htmlFor={`rename-station-${station.id}`}>电台名称</label>
          <input
            id={`rename-station-${station.id}`}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRenaming(false);
            }}
            autoFocus
            maxLength={160}
          />
          <button type="submit" className="library-rename-save">保存</button>
          <button type="button" className="library-rename-cancel" onClick={() => setRenaming(false)}>取消</button>
        </form>
      ) : null}
      {editingCover ? (
        <form className="station-cover-editor" onSubmit={applyCoverUrl}>
          <div className="station-cover-preview">
            <CoverArt kind={station.cover ?? coverForName(station.name)} image={stationImage(station)} className="library-station-art" />
          </div>
          <div className="station-cover-fields">
            <span className="station-cover-title">自定义电台封面</span>
            <div className="station-cover-upload-row">
              <button
                type="button"
                className="text-button"
                disabled={coverBusy}
                onClick={() => coverFileRef.current?.click()}
              >
                {coverBusy ? <Spinner label="处理图片" /> : <Icon name="image" size={13} />}
                {coverBusy ? '处理中…' : '上传本地图片'}
              </button>
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCoverFile(file);
                }}
              />
            </div>
            <div className="field-row station-cover-url-row">
              <input
                type="text"
                inputMode="url"
                value={coverUrl}
                onChange={(event) => setCoverUrl(event.target.value)}
                placeholder="或粘贴图片地址"
                disabled={coverBusy}
              />
              <button type="submit" className="library-rename-save" disabled={coverBusy}>应用</button>
            </div>
            {coverError ? <p className="station-cover-error" role="alert">{coverError}</p> : null}
            <div className="station-cover-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setStationCover(station.id, undefined);
                  setEditingCover(false);
                }}
              >
                恢复默认封面
              </button>
              <button type="button" className="library-rename-cancel" onClick={() => setEditingCover(false)}>取消</button>
            </div>
          </div>
        </form>
      ) : null}
    </>
  );
}

function StationPlaylistGroup({
  group,
  activeStationId,
  confirmRemove,
  onRequestRemove,
  onRemove,
  onPlay,
}: {
  group: StationPlaylistGroupData;
  activeStationId: string | null;
  confirmRemove: string | null;
  onRequestRemove: (stationId: string) => void;
  onRemove: (stationId: string) => void;
  onPlay: (stationId: string) => void;
}) {
  const { renameStationPlaylist } = useAppStore();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);

  useEffect(() => {
    if (!renaming) setDraft(group.name);
  }, [group.name, renaming]);

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      renameStationPlaylist(group.id, draft);
      return;
    }
    renameStationPlaylist(group.id, draft);
    setRenaming(false);
  };

  return (
    <section className="library-playlist">
      <div className="library-playlist-head">
        <button
          type="button"
          className="library-playlist-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
          <span className="library-playlist-title">{group.name}</span>
          <span className="library-playlist-count">{group.stations.length} 个电台</span>
        </button>
        <button
          type="button"
          className="library-rename library-playlist-rename"
          onClick={() => setRenaming(true)}
          aria-label={`重命名播放列表 ${group.name}`}
          title="重命名播放列表"
        >
          <Icon name="pencil" size={13} />
        </button>
      </div>
      {renaming ? (
        <form className="library-rename-form library-playlist-rename-form" onSubmit={submitRename}>
          <label className="visually-hidden" htmlFor={`rename-playlist-${group.id}`}>播放列表名称</label>
          <input
            id={`rename-playlist-${group.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRenaming(false);
            }}
            autoFocus
            maxLength={120}
          />
          <button type="submit" className="library-rename-save">保存</button>
          <button type="button" className="library-rename-cancel" onClick={() => setRenaming(false)}>取消</button>
        </form>
      ) : null}
      {open ? (
        <div className="library-station-list library-playlist-stations">
          {group.stations.map((station) => (
            <LibraryStationRow
              key={station.id}
              station={station}
              active={station.id === activeStationId}
              confirmRemove={confirmRemove === station.id}
              onRequestRemove={() => onRequestRemove(station.id)}
              onRemove={() => onRemove(station.id)}
              onPlay={() => onPlay(station.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function LibrarySheet({ open, onClose, onOpenServer }: LibrarySheetProps) {
  const { shows, stations, addStations, addShow, removeShow, removeStation, playStation, playStationAndAdd, notify, current, favorites } = useAppStore();
  const [tab, setTab] = useState<Tab>('podcast');
  const [addOpen, setAddOpen] = useState(false);
  const [expandedShow, setExpandedShow] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [podcastResults, setPodcastResults] = useState<PodcastSearchResult[]>([]);
  const [radioResults, setRadioResults] = useState<Station[]>([]);
  const [featured, setFeatured] = useState<Station[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [pendingFeed, setPendingFeed] = useState<string | null>(null);
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState('');
  const searchTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshingShow, setRefreshingShow] = useState<string | null>(null);
  const lastAutoRefreshAt = useRef(0);

  const refreshShow = async (show: Show) => {
    if (!show.feedUrl || refreshingShow) return;
    setRefreshingShow(show.id);
    try {
      const { show: next } = await fetchFeed(show.feedUrl, undefined, true);
      addShow(normalizeShow(next));
    } catch (error) {
      notify(error instanceof Error ? error.message : '刷新订阅失败。', 'error');
    } finally {
      setRefreshingShow(null);
    }
  };

  const subscribedRadioUrls = useMemo(() => new Set(stations.map((station) => station.url)), [stations]);
  const favoriteCount = useMemo(
    () => favorites.filter((key) => Boolean(findPlayableByKey(key, shows, stations))).length,
    [favorites, shows, stations],
  );
  const playlistGroups = useMemo(() => {
    const groups = new Map<string, StationPlaylistGroupData>();
    const ungrouped: Station[] = [];
    for (const station of stations) {
      if (!station.playlistId) {
        ungrouped.push(station);
        continue;
      }
      const group = groups.get(station.playlistId);
      if (group) {
        group.stations.push(station);
      } else {
        groups.set(station.playlistId, {
          id: station.playlistId,
          name: station.playlistName?.trim() || '未命名播放列表',
          stations: [station],
        });
      }
    }
    return { groups: [...groups.values()], ungrouped };
  }, [stations]);
  const stationRow = (station: Station) => (
    <LibraryStationRow
      key={station.id}
      station={station}
      active={current?.kind === 'radio' && current.station.id === station.id}
      confirmRemove={confirmRemove === station.id}
      onRequestRemove={() =>
        setConfirmRemove((value) => (value === station.id ? null : station.id))
      }
      onRemove={() => {
        removeStation(station.id);
        setConfirmRemove(null);
      }}
      onPlay={() => {
        playStation(station.id);
        onClose();
      }}
    />
  );

  useEffect(() => {
    if (!open) return;
    setConfirmRemove(null);
  }, [open]);

  // Opening the library is a natural moment to pull stale subscriptions.
  // Keep this quiet: a failed background refresh must not interrupt the user.
  useEffect(() => {
    if (!open) return;
    const now = Date.now();
    if (now - lastAutoRefreshAt.current < 60 * 1000) return;
    lastAutoRefreshAt.current = now;
    const stale = shows
      .filter((show) => show.feedUrl && (!show.fetchedAt || now - Date.parse(show.fetchedAt) > 30 * 60 * 1000))
      .slice(0, 3);
    if (!stale.length) return;
    void (async () => {
      for (const show of stale) {
        try {
          const { show: next } = await fetchFeed(show.feedUrl as string, undefined, true);
          addShow(normalizeShow(next), { silent: true });
        } catch {
          // Keep the last good subscription data.
        }
      }
    })();
  }, [open, shows, addShow]);

  useEffect(() => {
    if (!open || tab !== 'radio' || featured.length) return;
    const controller = new AbortController();
    void featuredRadio(controller.signal)
      .then(setFeatured)
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, tab, featured.length]);

  useEffect(() => {
    if (!open || tab === 'favorites') {
      abortRef.current?.abort();
      setSearching(false);
      setSearchError('');
      return;
    }
    const trimmed = query.trim();
    abortRef.current?.abort();
    setDirectError('');
    if (!trimmed) {
      setPodcastResults([]);
      setRadioResults([]);
      setSearching(false);
      setSearchError('');
      return;
    }
    if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
      // A pasted feed / playlist URL is not a directory search query.
      setPodcastResults([]);
      setRadioResults([]);
      setSearching(false);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      const request = tab === 'podcast' ? searchPodcasts(trimmed, controller.signal) : searchRadio(trimmed, controller.signal);
      request
        .then((results) => {
          if (controller.signal.aborted) return;
          if (tab === 'podcast') setPodcastResults(results as PodcastSearchResult[]);
          else setRadioResults(results as Station[]);
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return;
          setSearchError(err instanceof Error ? err.message : '搜索失败。');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 420);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query, tab, open]);

  useEffect(() => {
    setQuery('');
    setAddOpen(false);
    setSearchError('');
    setDirectError('');
  }, [tab]);

  const subscribeSearchResult = async (result: PodcastSearchResult) => {
    setPendingFeed(result.feedUrl);
    try {
      const { show } = await fetchFeed(result.feedUrl);
      addShow(normalizeShow(show));
      setPodcastResults((list) =>
        list.filter((item) => feedUrlKey(item.feedUrl) !== feedUrlKey(result.feedUrl)),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : '订阅失败。', 'error');
    } finally {
      setPendingFeed(null);
    }
  };

  const trimmedQuery = query.trim();
  const queryIsUrl = /^https?:\/\//i.test(trimmedQuery) && !/\s/.test(trimmedQuery);
  const shownRadioResults = trimmedQuery && !queryIsUrl ? radioResults : featured;

  const subscribeDirectUrl = async () => {
    if (!queryIsUrl || directBusy) return;
    setDirectBusy(true);
    setDirectError('');
    try {
      if (tab === 'podcast') {
        const { show } = await fetchFeed(trimmedQuery);
        addShow(normalizeShow(show));
        notify(`已订阅《${show.title}》。`, 'success');
      } else {
        const { stations } = await fetchPlaylist(trimmedQuery);
        const playlistName = derivePlaylistName(trimmedQuery);
        const single = stations.length === 1;
        const added = addStations(
          stations,
          single ? undefined : { playlistName },
        );
        notify(
          added
            ? single
              ? `已导入《${stations[0].name}》。`
              : `已导入 ${added} 个电台到《${playlistName}》。`
            : '这些电台已经在列表里了。',
          added ? 'success' : 'default',
        );
      }
      setQuery('');
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : '读取这个地址失败。');
    } finally {
      setDirectBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="LIBRARY"
      title="我的订阅"
      className="library-sheet"
      footer={
        <div className="library-footer">
          <button type="button" className="library-server-button" onClick={onOpenServer}>
            <Icon name="signal" size={13} />
            {getServerBase() ? getServerBase().replace(/^https?:\/\//, '') : isNativePlatform() ? '连接服务端' : '同源服务'}
          </button>
          <span className="mono">RSS 2.0 · ATOM · M3U · HLS</span>
        </div>
      }
    >
      <div className="library">
        <div className="library-tab-row">
          <div className="library-tabs" role="tablist" aria-label="订阅类型">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'podcast'}
              className={tab === 'podcast' ? 'is-active' : ''}
              onClick={() => setTab('podcast')}
            >
              播客 <span>{shows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'radio'}
              className={tab === 'radio' ? 'is-active' : ''}
              onClick={() => setTab('radio')}
            >
              电台 <span>{stations.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'favorites'}
              className={tab === 'favorites' ? 'is-active' : ''}
              onClick={() => setTab('favorites')}
            >
              收藏 <span>{favoriteCount}</span>
            </button>
          </div>
          {tab !== 'favorites' ? (
            <button type="button" className="library-add-button" onClick={() => setAddOpen((value) => !value)}>
              <Icon name={addOpen ? 'close' : 'plus'} size={15} />
              {addOpen ? '收起' : tab === 'podcast' ? '添加 RSS' : '导入 M3U'}
            </button>
          ) : null}
        </div>

        {tab === 'favorites' ? (
          <FavoritesPane onPlayed={onClose} />
        ) : (
          <>
        {addOpen ? (
          tab === 'podcast' ? (
            <AddPodcastForm onDone={() => setAddOpen(false)} />
          ) : (
            <ImportPlaylistForm onDone={() => setAddOpen(false)} />
          )
        ) : null}

        <div className="library-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === 'podcast' ? '搜索播客名称，或粘贴 RSS 链接' : '搜索电台名称，或粘贴 M3U 链接'
            }
            aria-label={tab === 'podcast' ? '搜索播客' : '搜索网络电台'}
          />
          {query ? (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
              <Icon name="close" size={14} />
            </button>
          ) : null}
          {searching ? <Spinner label="搜索中" /> : null}
        </div>
        {searchError ? <p className="inline-error">{searchError}</p> : null}

        {queryIsUrl ? (
          <section className="direct-subscribe" aria-label="直接订阅地址">
            <div className="library-section-title">
              <span>{tab === 'podcast' ? '检测到 RSS 地址' : '检测到 M3U / 流地址'}</span>
              <span className="mono">LINK</span>
            </div>
            <div className="direct-subscribe-card">
              <span className="direct-icon" aria-hidden="true">
                <Icon name={tab === 'podcast' ? 'rss' : 'radio'} size={20} />
              </span>
              <span className="direct-copy">
                <span className="direct-title">
                  {tab === 'podcast' ? '直接订阅这个 RSS' : '导入这个播放列表 / 电台流'}
                </span>
                <span className="direct-url">{trimmedQuery}</span>
              </span>
              <button
                type="button"
                className="solid-button direct-subscribe-button"
                onClick={subscribeDirectUrl}
                disabled={directBusy}
              >
                {directBusy ? <Spinner /> : <Icon name="plus" size={14} />}
                {directBusy ? '读取中' : tab === 'podcast' ? '订阅' : '导入'}
              </button>
            </div>
            {directError ? <p className="form-error" role="alert">{directError}</p> : null}
          </section>
        ) : null}

        {tab === 'podcast' && trimmedQuery && !queryIsUrl ? (
          <section className="search-results" aria-label="搜索结果">
            <div className="library-section-title">
              <span>搜索结果</span>
              <span className="mono">{podcastResults.length.toString().padStart(2, '0')}</span>
            </div>
            {podcastResults.map((result) => {
              const already = shows.some(
                (show) => show.feedUrl && feedUrlKey(show.feedUrl) === feedUrlKey(result.feedUrl),
              );
              return (
                <div key={result.id} className="search-result">
                  <CoverArt image={result.image} kind="ridge" className="search-result-art" />
                  <div className="search-result-copy">
                    <span className="search-result-title">{result.title}</span>
                    <span className="search-result-meta">{result.author}{result.genre ? ` · ${result.genre}` : ''}</span>
                  </div>
                  <button
                    type="button"
                    className={`small-action ${already ? 'is-done' : ''}`}
                    disabled={already || pendingFeed === result.feedUrl}
                    onClick={() => subscribeSearchResult(result)}
                  >
                    {pendingFeed === result.feedUrl ? <Spinner /> : already ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
                    {already ? '已订阅' : pendingFeed === result.feedUrl ? '读取中' : '订阅'}
                  </button>
                </div>
              );
            })}
            {!podcastResults.length && !searching ? <p className="muted-copy">没有找到结果，试试别的关键词。</p> : null}
          </section>
        ) : null}

        {tab === 'radio' && !queryIsUrl ? (
          <section className="search-results" aria-label="推荐电台">
            <div className="library-section-title">
              <span>{trimmedQuery ? '搜索结果' : '编辑精选'}</span>
              <span className="mono">{shownRadioResults.length.toString().padStart(2, '0')}</span>
            </div>
            {shownRadioResults.map((station) => {
              const already = subscribedRadioUrls.has(station.url);
              return (
                <div key={station.id} className="search-result">
                  <CoverArt kind={station.cover ?? coverForName(station.name)} image={stationImage(station)} className="search-result-art" />
                  <div className="search-result-copy">
                    <span className="search-result-title">{station.name}</span>
                    <span className="search-result-meta">
                      {[station.group, station.country, station.bitrate ? `${station.bitrate}kbps` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="search-result-actions">
                    <button
                      type="button"
                      className="small-icon-action"
                      aria-label={`试听 ${station.name}`}
                      title="试听"
                      onClick={() => {
                        playStationAndAdd(station);
                        onClose();
                      }}
                    >
                      <Icon name="play" size={14} />
                    </button>
                    <button
                      type="button"
                      className={`small-action ${already ? 'is-done' : ''}`}
                      disabled={already}
                      onClick={() => {
                        const added = addStations([station]);
                        notify(added ? `已添加 ${station.name}。` : '已经在你的电台列表里了。', added ? 'success' : 'default');
                      }}
                    >
                      <Icon name={already ? 'check' : 'plus'} size={14} />
                      {already ? '已添加' : '添加'}
                    </button>
                  </div>
                </div>
              );
            })}
            {!shownRadioResults.length && !searching ? <p className="muted-copy">没有找到电台，试试英文关键词或换个名字。</p> : null}
          </section>
        ) : null}

        <section className="library-subscribed" aria-label="已订阅内容">
          <div className="library-section-title">
            <span>{tab === 'podcast' ? '已订阅播客' : '我的电台'}</span>
            <span className="mono">{tab === 'podcast' ? shows.length : stations.length}</span>
          </div>

          {tab === 'podcast' ? (
            shows.length ? (
              <div className="library-show-list">
                {shows.map((show) => (
                  <PodcastLibraryItem
                    key={show.id}
                    show={show}
                    expanded={expandedShow === show.id}
                    onToggle={() => setExpandedShow((value) => (value === show.id ? null : show.id))}
                    confirmRemove={confirmRemove === show.id}
                    onRequestRemove={() =>
                      setConfirmRemove((value) => (value === show.id ? null : show.id))
                    }
                    onPlayed={onClose}
                    onRefresh={() => void refreshShow(show)}
                    refreshing={refreshingShow === show.id}
                    onRemove={() => {
                      removeShow(show.id);
                      setConfirmRemove(null);
                      if (expandedShow === show.id) setExpandedShow(null);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="library-empty">
                <p>还没有订阅任何播客。</p>
                <span>在上面粘贴 RSS 地址，或者搜索一档节目。</span>
              </div>
            )
          ) : stations.length ? (
            <div className="library-radio-groups">
              {playlistGroups.groups.map((group) => (
                <StationPlaylistGroup
                  key={group.id}
                  group={group}
                  activeStationId={current?.kind === 'radio' ? current.station.id : null}
                  confirmRemove={confirmRemove}
                  onRequestRemove={(stationId) =>
                    setConfirmRemove((value) => (value === stationId ? null : stationId))
                  }
                  onRemove={(stationId) => {
                    removeStation(stationId);
                    setConfirmRemove(null);
                  }}
                  onPlay={(stationId) => {
                    playStation(stationId);
                    onClose();
                  }}
                />
              ))}
              {playlistGroups.ungrouped.length ? (
                <>
                  {playlistGroups.groups.length ? (
                    <div className="library-playlist-head library-playlist-head--unfiled">
                      <span>未分组电台</span>
                      <span className="library-playlist-count">{playlistGroups.ungrouped.length} 个电台</span>
                    </div>
                  ) : null}
                  <div className="library-station-list">
                    {playlistGroups.ungrouped.map(stationRow)}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="library-empty">
              <p>电台列表还是空的。</p>
              <span>导入一份 M3U，或者从编辑精选里添加几个电台。</span>
            </div>
          )}
        </section>
          </>
        )}

      </div>
    </Sheet>
  );
}
