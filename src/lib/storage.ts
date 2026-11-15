/* SPDX-License-Identifier: GPL-3.0-only */

import type { PersistedState, Preferences, Station, Show } from '../types';
import { createSeedState } from '../data/seed';
import { migrateLegacyStationPlaylists } from './stations';

const STORAGE_KEY = 'stay-tuned:v1';
const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  mode: 'skeuo',
  volume: 0.72,
  rate: 1,
  followTranscript: true,
  haptics: true,
  history: [],
};

function isShow(value: unknown): value is Show {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Show).id === 'string' &&
      typeof (value as Show).title === 'string' &&
      Array.isArray((value as Show).episodes),
  );
}

function isStation(value: unknown): value is Station {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Station).id === 'string' &&
      typeof (value as Station).url === 'string' &&
      typeof (value as Station).name === 'string',
  );
}

function sanitize(input: unknown): PersistedState | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<PersistedState>;
  if (raw.version !== 1) return null;
  if (!Array.isArray(raw.shows) || !Array.isArray(raw.stations)) return null;

  const shows = raw.shows.filter(isShow);
  const stations = migrateLegacyStationPlaylists(raw.stations.filter(isStation));
  const queue = Array.isArray(raw.queue)
    ? raw.queue.filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.key === 'string' &&
          entry.ref &&
          (entry.ref.kind === 'episode' || entry.ref.kind === 'radio'),
      )
    : [];
  const positions =
    raw.positions && typeof raw.positions === 'object'
      ? Object.fromEntries(
          Object.entries(raw.positions).filter(
            ([key, value]) => typeof key === 'string' && typeof value === 'number' && Number.isFinite(value),
          ),
        )
      : {};
  const favorites = Array.isArray(raw.favorites)
    ? raw.favorites.filter((item): item is string => typeof item === 'string')
    : [];
  const preferences = {
    ...DEFAULT_PREFERENCES,
    ...(raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {}),
  };
  if (!['light', 'dark'].includes(preferences.theme)) preferences.theme = 'light';
  if (!['skeuo', 'flat'].includes(preferences.mode)) preferences.mode = 'skeuo';
  preferences.volume = Math.min(1, Math.max(0, Number(preferences.volume) || 0));
  preferences.rate = Math.min(2, Math.max(0.5, Number(preferences.rate) || 1));
  preferences.followTranscript = Boolean(preferences.followTranscript);
  // Older backups have no `haptics` field; keep the switch on unless it was
  // explicitly turned off.
  preferences.haptics = preferences.haptics !== false;
  if (!Array.isArray(preferences.history)) preferences.history = [];

  const current =
    raw.current && (raw.current.kind === 'episode' || raw.current.kind === 'radio') ? raw.current : null;

  return {
    version: 1,
    shows,
    stations,
    queue,
    current,
    positions,
    favorites,
    preferences,
  };
}

export function loadPersistedState(): PersistedState {
  if (typeof window === 'undefined') return createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = sanitize(JSON.parse(raw));
    if (!parsed) return createSeedState();
    // If a previous session cleared all content there is still a valid empty library.
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full storage quota should never break playback.
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
