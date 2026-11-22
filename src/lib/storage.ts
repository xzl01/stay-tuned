/* SPDX-License-Identifier: GPL-3.0-only */

import type {
  Chapter,
  CoverKind,
  Episode,
  PersistedState,
  PlayableRef,
  Preferences,
  QueueEntry,
  Station,
  Show,
  Theme,
  TranscriptLine,
} from '../types';
import { createSeedState } from '../data/seed';
import { migrateLegacyStationPlaylists } from './stations';

const STORAGE_KEY = 'stay-tuned:v1';
const POSITIONS_KEY = 'stay-tuned:positions';

/** Hard caps so a corrupt or hostile file cannot wedge the renderer. */
const LIMITS = {
  shows: 2000,
  episodesPerShow: 5000,
  stations: 5000,
  queue: 2000,
  favorites: 5000,
  positions: 20000,
  history: 200,
  chapters: 2000,
  transcript: 20000,
  text: 4000,
};

const COVER_KINDS = new Set<CoverKind>(['arch', 'ridge', 'window', 'field', 'signal', 'night', 'dune']);
const THEMES = new Set<Theme>(['light', 'dark', 'system']);

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  mode: 'skeuo',
  volume: 0.72,
  rate: 1,
  followTranscript: true,
  haptics: true,
  backScreen: true,
  autoCacheNewEpisodes: false,
  autoCachePlaying: false,
  history: [],
};

function text(value: unknown, max = LIMITS.text): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function optionalText(value: unknown, max = LIMITS.text): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, max) : undefined;
}

function isHttpUrl(value: unknown): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Media covers inline data URLs (uploaded station logos) and site-relative
 * paths: the bundled demo audio and every sub-path deployment (GitHub Pages,
 * `VITE_BASE`) are served from `/audio/...` rather than an absolute URL.
 */
function isMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^data:image\//i.test(trimmed)) return true;
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}

function isCoverKind(value: unknown): value is CoverKind {
  return typeof value === 'string' && COVER_KINDS.has(value as CoverKind);
}

function sanitizeChapters(value: unknown): Chapter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const chapters = value
    .slice(0, LIMITS.chapters)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Partial<Chapter>;
      const start = Number(raw.start);
      if (!Number.isFinite(start) || start < 0) return null;
      return { start, title: text(raw.title, 400) } satisfies Chapter;
    })
    .filter((entry): entry is Chapter => entry !== null);
  return chapters.length ? chapters : undefined;
}

function sanitizeTranscript(value: unknown): TranscriptLine[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines = value
    .slice(0, LIMITS.transcript)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Partial<TranscriptLine>;
      const start = Number(raw.start);
      if (!Number.isFinite(start) || start < 0) return null;
      return { start, text: text(raw.text) } satisfies TranscriptLine;
    })
    .filter((entry): entry is TranscriptLine => entry !== null);
  return lines.length ? lines : undefined;
}

function sanitizeEpisode(value: unknown, showId: string): Episode | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Episode>;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const audioUrl = typeof raw.audioUrl === 'string' ? raw.audioUrl.trim() : '';
  if (!isMediaUrl(audioUrl)) return null;
  const duration = Number(raw.duration);
  const episodeNumber = Number(raw.episodeNumber);
  return {
    id: raw.id.slice(0, 200),
    showId,
    title: text(raw.title),
    description: text(raw.description),
    audioUrl,
    duration: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 24 * 60 * 60) : 0,
    pubDate: optionalText(raw.pubDate, 40),
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : undefined,
    image: isMediaUrl(raw.image) ? raw.image : undefined,
    chapters: sanitizeChapters(raw.chapters),
    transcript: sanitizeTranscript(raw.transcript),
    // Chapter and transcript URLs are fetched through the API, which needs an
    // absolute http(s) address.
    transcriptUrl: isHttpUrl(raw.transcriptUrl) ? raw.transcriptUrl : undefined,
    transcriptType: optionalText(raw.transcriptType, 80),
    transcriptLanguage: optionalText(raw.transcriptLanguage, 40),
    chaptersUrl: isHttpUrl(raw.chaptersUrl) ? raw.chaptersUrl : undefined,
    chaptersType: optionalText(raw.chaptersType, 80),
  };
}

function sanitizeShow(value: unknown): Show | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Show>;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.title !== 'string') return null;
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes
        .slice(0, LIMITS.episodesPerShow)
        .map((episode) => sanitizeEpisode(episode, raw.id as string))
        .filter((episode): episode is Episode => episode !== null)
    : [];
  return {
    id: raw.id.slice(0, 200),
    title: text(raw.title),
    customTitle: optionalText(raw.customTitle),
    author: text(raw.author),
    description: text(raw.description),
    image: isMediaUrl(raw.image) ? raw.image : undefined,
    cover: isCoverKind(raw.cover) ? raw.cover : undefined,
    feedUrl: isHttpUrl(raw.feedUrl) ? raw.feedUrl : undefined,
    siteUrl: isHttpUrl(raw.siteUrl) ? raw.siteUrl : undefined,
    category: optionalText(raw.category, 120),
    fetchedAt: optionalText(raw.fetchedAt, 40),
    episodes,
  };
}

function sanitizeStation(value: unknown): Station | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Station>;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string') return null;
  const stationUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//i.test(stationUrl)) return null;
  const bitrate = Number(raw.bitrate);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.slice(0, 40).map((tag) => text(tag, 60)).filter(Boolean)
    : undefined;
  return {
    id: raw.id.slice(0, 200),
    name: text(raw.name, 400),
    url: stationUrl,
    playlistId: optionalText(raw.playlistId, 200),
    playlistName: optionalText(raw.playlistName, 400),
    source: optionalText(raw.source),
    customLogo: isMediaUrl(raw.customLogo) ? raw.customLogo : undefined,
    group: optionalText(raw.group, 200),
    logo: isMediaUrl(raw.logo) ? raw.logo : undefined,
    cover: isCoverKind(raw.cover) ? raw.cover : undefined,
    country: optionalText(raw.country, 80),
    tags: tags && tags.length ? tags : undefined,
    bitrate: Number.isFinite(bitrate) && bitrate > 0 ? Math.min(bitrate, 10000) : undefined,
    codec: optionalText(raw.codec, 40),
    homepage: isHttpUrl(raw.homepage) ? raw.homepage : undefined,
  };
}

function sanitizeRef(value: unknown): PlayableRef | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PlayableRef> & Record<string, unknown>;
  if (raw.kind === 'episode' && typeof raw.showId === 'string' && typeof raw.episodeId === 'string') {
    return { kind: 'episode', showId: raw.showId.slice(0, 200), episodeId: raw.episodeId.slice(0, 200) };
  }
  if (raw.kind === 'radio' && typeof raw.stationId === 'string') {
    return { kind: 'radio', stationId: raw.stationId.slice(0, 200) };
  }
  return null;
}

function sanitizeQueue(value: unknown): QueueEntry[] {
  if (!Array.isArray(value)) return [];
  const queue: QueueEntry[] = [];
  for (const entry of value.slice(0, LIMITS.queue)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Partial<QueueEntry>;
    if (typeof raw.key !== 'string') continue;
    const ref = sanitizeRef(raw.ref);
    if (!ref) continue;
    const addedAt = Number(raw.addedAt);
    queue.push({ key: raw.key.slice(0, 300), ref, addedAt: Number.isFinite(addedAt) ? addedAt : Date.now() });
  }
  return queue;
}

function sanitizePositions(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const positions: Record<string, number> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (count >= LIMITS.positions) break;
    const seconds = Number(raw);
    if (typeof key !== 'string' || !key || !Number.isFinite(seconds)) continue;
    positions[key.slice(0, 300)] = Math.max(0, Math.min(seconds, 24 * 60 * 60));
    count += 1;
  }
  return positions;
}

function sanitizePreferences(value: unknown): Preferences {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Preferences>;
  const preferences: Preferences = {
    ...DEFAULT_PREFERENCES,
    theme: THEMES.has(raw.theme as Theme) ? (raw.theme as Theme) : DEFAULT_PREFERENCES.theme,
    mode: raw.mode === 'flat' ? 'flat' : 'skeuo',
    volume: Math.min(1, Math.max(0, Number(raw.volume) || 0)),
    rate: Math.min(2, Math.max(0.5, Number(raw.rate) || 1)),
    followTranscript: Boolean(raw.followTranscript),
    // Older backups have no `haptics` field; keep the switch on unless it was
    // explicitly turned off.
    haptics: raw.haptics !== false,
    backScreen: raw.backScreen !== false,
    autoCacheNewEpisodes: Boolean(raw.autoCacheNewEpisodes),
    autoCachePlaying: Boolean(raw.autoCachePlaying),
    history: Array.isArray(raw.history)
      ? raw.history.slice(0, LIMITS.history).filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 300))
      : [],
  };
  return preferences;
}

/**
 * Validate and clean an untrusted persisted state (localStorage or an imported
 * backup file). Returns null when the shape is not a library at all.
 */
export function sanitizePersistedState(input: unknown): PersistedState | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<PersistedState>;
  if (raw.version !== 1) return null;
  if (!Array.isArray(raw.shows) || !Array.isArray(raw.stations)) return null;

  const shows = raw.shows
    .slice(0, LIMITS.shows)
    .map(sanitizeShow)
    .filter((show): show is Show => show !== null);
  const stations = migrateLegacyStationPlaylists(
    raw.stations
      .slice(0, LIMITS.stations)
      .map(sanitizeStation)
      .filter((station): station is Station => station !== null),
  );
  const favorites = Array.isArray(raw.favorites)
    ? [...new Set(raw.favorites.slice(0, LIMITS.favorites).filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 300)))]
    : [];

  return {
    version: 1,
    shows,
    stations,
    queue: sanitizeQueue(raw.queue),
    current: sanitizeRef(raw.current),
    positions: sanitizePositions(raw.positions),
    favorites,
    preferences: sanitizePreferences(raw.preferences),
  };
}

export function loadPersistedState(): PersistedState {
  if (typeof window === 'undefined') return createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = sanitizePersistedState(JSON.parse(raw));
    if (!parsed) return createSeedState();
    // Playback progress lives in its own key so writing it never rewrites the
    // whole library; older builds stored it inline, which stays the fallback.
    const savedPositions = window.localStorage.getItem(POSITIONS_KEY);
    if (savedPositions) {
      try {
        parsed.positions = sanitizePositions(JSON.parse(savedPositions));
      } catch {
        // Keep the positions embedded in the library file.
      }
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

/** Library, queue and preferences. Never includes playback positions. */
export function savePersistedState(state: PersistedState): void {
  try {
    const { positions: _positions, ...library } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // A full storage quota should never break playback.
  }
}

/** Small, frequently updated map kept separate from the library. */
export function savePositions(positions: PersistedState['positions']): void {
  try {
    window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    // Ignore quota errors; progress is best effort.
  }
}

export function clearPersistedState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

export function resolveInitialTheme(): { theme: PersistedState['preferences']['theme']; mode: PersistedState['preferences']['mode'] } {
  const state = loadPersistedState();
  return { theme: state.preferences.theme, mode: state.preferences.mode };
}
