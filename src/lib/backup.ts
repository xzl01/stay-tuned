/* SPDX-License-Identifier: GPL-3.0-only */

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { PersistedState, Show, Station } from '../types';
import { isNativePlatform } from './serverConfig';

export const BACKUP_SCHEMA = 1;

export interface BackupFile {
  app: 'stay-tuned';
  schema: number;
  exportedAt: string;
  data: PersistedState;
}

export type ImportMode = 'merge' | 'replace';

export function buildBackup(state: PersistedState): BackupFile {
  return {
    app: 'stay-tuned',
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

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

/** Accept our own export or a plain persisted-state file from an older build. */
export function parseBackup(text: string): PersistedState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('这个文件不是有效的 JSON。');
  }
  const candidate =
    raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
      ? (raw as { data: unknown }).data
      : raw;
  if (!candidate || typeof candidate !== 'object') throw new Error('文件内容不是留频的订阅配置。');
  const state = candidate as Partial<PersistedState>;
  if (state.version !== 1) throw new Error('配置文件版本不受支持。');
  if (!Array.isArray(state.shows) || !Array.isArray(state.stations)) {
    throw new Error('配置文件缺少订阅列表。');
  }
  const shows = state.shows.filter(isShow);
  const stations = state.stations.filter(isStation);
  if (!shows.length && !stations.length) throw new Error('配置文件里没有可导入的订阅。');
  return {
    version: 1,
    shows,
    stations,
    queue: Array.isArray(state.queue) ? state.queue : [],
    current: state.current ?? null,
    positions: state.positions && typeof state.positions === 'object' ? state.positions : {},
    favorites: Array.isArray(state.favorites)
      ? state.favorites.filter((key): key is string => typeof key === 'string')
      : [],
    preferences:
      state.preferences && typeof state.preferences === 'object'
        ? state.preferences
        : ({} as PersistedState['preferences']),
  };
}

function feedKey(show: Show): string {
  return (show.feedUrl ?? show.id).trim().toLowerCase();
}

/**
 * Merge keeps the local device's playback state while adding subscriptions.
 * Duplicate feeds keep the newer episode list.
 */
export function mergeBackup(current: PersistedState, incoming: PersistedState): PersistedState {
  const shows = new Map<string, Show>();
  for (const show of current.shows) shows.set(feedKey(show), show);
  for (const show of incoming.shows) {
    const key = feedKey(show);
    const existing = shows.get(key);
    if (!existing) {
      shows.set(key, show);
      continue;
    }
    const existingTime = Date.parse(existing.fetchedAt ?? '') || 0;
    const incomingTime = Date.parse(show.fetchedAt ?? '') || 0;
    if (incomingTime >= existingTime) {
      shows.set(key, { ...show, id: existing.id, customTitle: existing.customTitle });
    }
  }

  const stations = new Map<string, Station>();
  for (const station of current.stations) stations.set(station.url, station);
  for (const station of incoming.stations) {
    if (!stations.has(station.url)) stations.set(station.url, station);
  }

  const positions = { ...incoming.positions };
  for (const [key, value] of Object.entries(current.positions)) {
    positions[key] = Math.max(value, positions[key] ?? 0);
  }

  const queue = [...current.queue];
  for (const entry of incoming.queue) {
    if (!queue.some((item) => item.key === entry.key)) queue.push(entry);
  }

  return {
    ...current,
    shows: [...shows.values()],
    stations: [...stations.values()],
    favorites: [...new Set([...current.favorites, ...incoming.favorites])],
    queue,
    positions,
  };
}

function backupFilename(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `stay-tuned-${stamp}.json`;
}

/** Save a backup and hand it to the system share sheet (Android) or download it. */
export async function exportBackupFile(state: PersistedState): Promise<string> {
  const json = JSON.stringify(buildBackup(state), null, 2);
  const name = backupFilename();

  if (isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: name,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({
        title: '留频订阅备份',
        text: '留频订阅配置',
        url: result.uri,
        dialogTitle: '保存或分享订阅备份',
      });
    } catch {
      // Dismissing the share sheet is fine; the file is already written.
    }
    return `Documents/${name}`;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
