/* SPDX-License-Identifier: GPL-3.0-only */

import type { Station } from '../types';

export function stationImage(station?: Pick<Station, 'logo' | 'customLogo'> | null): string | undefined {
  return station?.customLogo?.trim() || station?.logo?.trim() || undefined;
}

function hashString(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

export function derivePlaylistName(source: string): string {
  if (!source) return '导入的 M3U 播放列表';
  if (/^https?:\/\/local\.invalid\/?$/i.test(source)) return '本地 M3U 电台';
  try {
    const url = new URL(source);
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    const file = last.replace(/\.(m3u8?|pls)$/i, '').trim();
    return file || url.hostname || '导入的 M3U 播放列表';
  } catch {
    return source.replace(/\.(m3u8?|pls)$/i, '').trim() || '导入的 M3U 播放列表';
  }
}

/**
 * Older versions stored the original playlist URL as `source` on every
 * imported station, without a playlist identity. Turn that data into editable
 * groups the first time the library is opened after this upgrade.
 */
export function migrateLegacyStationPlaylists(stations: Station[]): Station[] {
  const sourceCounts = new Map<string, number>();
  for (const station of stations) {
    if (!station.source || station.playlistId) continue;
    sourceCounts.set(station.source, (sourceCounts.get(station.source) ?? 0) + 1);
  }
  const playlistNames = new Map<string, string>();
  for (const station of stations) {
    if (!station.source || station.playlistId) continue;
    // A single station URL is a stream, not a playlist worth grouping.
    if ((sourceCounts.get(station.source) ?? 0) < 2) continue;
    const id = `legacy-playlist-${hashString(station.source)}`;
    playlistNames.set(id, derivePlaylistName(station.source));
  }
  const migrated = !playlistNames.size
    ? stations
    : stations.map((station) => {
        if (!station.source || station.playlistId) return station;
        const playlistId = `legacy-playlist-${hashString(station.source)}`;
        if (!playlistNames.has(playlistId)) return station;
        return { ...station, playlistId, playlistName: playlistNames.get(playlistId) };
      });
  return flattenSingleStationPlaylists(migrated);
}

function looksLikeStreamFilename(name: string): boolean {
  const value = name.trim();
  return (
    /^\d{3,}$/.test(value) ||
    /\.(ts|m3u8?|mp3|aac|m4a|ogg|opus|flac|wav|pls)$/i.test(value)
  );
}

/**
 * A one-station M3U usually represents a single HLS/stream URL, not a real
 * playlist. Our first playlist implementation could leave a redundant group
 * header and the raw filename visible; promote that group name to the station
 * name so the user only sees the name they chose.
 */
export function flattenSingleStationPlaylists(stations: Station[]): Station[] {
  const counts = new Map<string, number>();
  for (const station of stations) {
    if (station.playlistId) counts.set(station.playlistId, (counts.get(station.playlistId) ?? 0) + 1);
  }
  return stations.map((station) => {
    if (!station.playlistId || counts.get(station.playlistId) !== 1) return station;
    if (!station.playlistName || !looksLikeStreamFilename(station.name)) return station;
    return {
      ...station,
      name: station.playlistName,
      playlistId: undefined,
      playlistName: undefined,
      source: undefined,
    };
  });
}
