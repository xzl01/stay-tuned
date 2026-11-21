/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * In-app engine. The packaged Android build has no Node server, so the exact
 * parser modules used by the API are imported here and run inside the WebView.
 * Network calls go through CapacitorHttp, which bypasses CORS.
 */

import { fetchFeed as fetchFeedSource } from '../../../server/feed.mjs';
import { fetchPlaylist as fetchPlaylistSource, parsePlaylist } from '../../../server/playlist.mjs';
import { parseChapters, parseTranscript } from '../../../server/extras.mjs';
import { assertHttpUrl, fetchJson, fetchText, setFetchTransport } from '../../../server/http.mjs';
import {
  FEATURED_STATIONS,
  ITUNES_SEARCH_ENDPOINT,
  RADIO_MIRRORS,
  mapItunesPodcast,
  normalizeStation,
} from '../../../server/catalog.mjs';
import type { Chapter, FeedResponse, PodcastSearchResult, Station, TranscriptLine } from '../../types';
import { isHarmonyBridgeAvailable, harmonyTransport } from './harmony';
import { isNativeHttpAvailable, nativeTransport, webTransport } from './transport';

let installed = false;

/** Install the native transport once; browsers keep their own fetch. */
export function installLocalTransport(): void {
  if (installed) return;
  installed = true;
  if (isNativeHttpAvailable()) {
    setFetchTransport(nativeTransport);
  } else if (isHarmonyBridgeAvailable()) {
    // ArkWeb: the ArkTS proxy performs the request outside the WebView's CORS rules.
    setFetchTransport(harmonyTransport);
  } else {
    setFetchTransport(webTransport);
  }
}

function ensureTransport(): void {
  installLocalTransport();
}

export async function localFetchFeed(url: string, refresh = false): Promise<FeedResponse> {
  ensureTransport();
  assertHttpUrl(url, 'RSS 地址');
  const feed = await fetchFeedSource(url);
  if (!feed.show.episodes.length) {
    throw new Error('这个订阅源里没有找到可播放的音频单集。');
  }
  // Refresh is a no-op locally: there is no shared cache to invalidate.
  void refresh;
  return feed as FeedResponse;
}

export async function localFetchChapters(url: string): Promise<{ chapters: Chapter[] }> {
  ensureTransport();
  const { text } = await fetchText(assertHttpUrl(url, '章节地址').toString());
  return { chapters: parseChapters(text) as Chapter[] };
}

export async function localFetchTranscript(
  url: string,
  type?: string,
): Promise<{ lines: TranscriptLine[]; type: string }> {
  ensureTransport();
  const { text, contentType } = await fetchText(assertHttpUrl(url, '文字稿地址').toString());
  return {
    lines: parseTranscript(text, type || contentType, url) as TranscriptLine[],
    type: type || contentType,
  };
}

export async function localFetchPlaylist(
  url: string,
): Promise<{ stations: Station[]; playlistUrl: string }> {
  ensureTransport();
  return (await fetchPlaylistSource(url)) as { stations: Station[]; playlistUrl: string };
}

export function localParsePlaylistText(text: string): Station[] {
  return parsePlaylist(text) as Station[];
}

export async function localSearchPodcasts(query: string): Promise<PodcastSearchResult[]> {
  ensureTransport();
  const term = query.trim();
  if (!term) return [];
  if (term.length > 80) throw new Error('搜索词太长。');
  const url = new URL(ITUNES_SEARCH_ENDPOINT);
  url.searchParams.set('term', term);
  url.searchParams.set('media', 'podcast');
  url.searchParams.set('entity', 'podcast');
  url.searchParams.set('limit', '14');
  const json = (await fetchJson(url.toString())) as { results?: unknown[] };
  return (json.results ?? [])
    .map((item) => mapItunesPodcast(item as Record<string, unknown>) as PodcastSearchResult)
    .filter((item) => item.feedUrl && item.title);
}

export async function localSearchRadio(query: string): Promise<Station[]> {
  ensureTransport();
  const term = query.trim();
  if (!term) return [];
  if (term.length > 80) throw new Error('搜索词太长。');
  let lastError: unknown;
  for (const mirror of RADIO_MIRRORS as string[]) {
    try {
      const url = new URL('/json/stations/search', mirror);
      url.searchParams.set('name', term);
      url.searchParams.set('limit', '20');
      url.searchParams.set('hidebroken', 'true');
      url.searchParams.set('order', 'clickcount');
      url.searchParams.set('reverse', 'true');
      const json = await fetchJson(url.toString(), { timeout: 9_000 });
      const list = Array.isArray(json) ? json : [];
      return list
        .map((item) => normalizeStation(item as Record<string, unknown>) as Station)
        .filter((station) => station.url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('电台目录暂不可用。');
}

export function localFeaturedRadio(): Station[] {
  return FEATURED_STATIONS as Station[];
}
