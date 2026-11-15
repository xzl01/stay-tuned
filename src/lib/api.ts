/* SPDX-License-Identifier: GPL-3.0-only */

import type { Chapter, FeedResponse, PodcastSearchResult, Station, TranscriptLine } from '../types';
import { STATIC_DEMO } from './env';
import { apiUrl, absolutize, getServerBase, isNativePlatform } from './serverConfig';
import type * as LocalEngine from './engine/local';

/**
 * The packaged app runs every parser on-device (see lib/engine/local), so no
 * backend is required. Browsers keep using the Node API because public feeds
 * do not send CORS headers.
 */
export const LOCAL_ENGINE = isNativePlatform();

/**
 * Load the in-app engine on demand so browsers never download the parsers.
 */
async function engine(): Promise<typeof LocalEngine> {
  return import('./engine/local');
}

/** Wrap engine failures in ApiError so the UI can show one error shape. */
async function local<T>(produce: (mod: typeof LocalEngine) => Promise<T> | T): Promise<T> {
  const mod = await engine();
  mod.installLocalTransport();
  try {
    return await produce(mod);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 0;
    const message = error instanceof Error ? error.message : '本地解析失败。';
    throw new ApiError(message, status);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (STATIC_DEMO) {
    throw new ApiError('GitHub Pages 是静态演示版；RSS、搜索和 M3U 导入请在本机运行完整版。');
  }
  const url = apiUrl(path);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null) url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url.toString(), { signal, headers: { accept: 'application/json' } });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(
      getServerBase()
        ? `无法连接 ${getServerBase()}，请确认服务已启动并且手机能访问该地址。`
        : '无法连接本地服务，请确认 API 服务已启动。',
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `请求失败（${response.status}）`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export function fetchFeed(url: string, signal?: AbortSignal, refresh = false): Promise<FeedResponse> {
  if (LOCAL_ENGINE) return local((engine) => engine.localFetchFeed(url, refresh));
  return request<FeedResponse>('/api/feed', refresh ? { url, refresh: '1' } : { url }, signal);
}

export function fetchChapters(url: string, signal?: AbortSignal): Promise<{ chapters: Chapter[] }> {
  if (LOCAL_ENGINE) return local((engine) => engine.localFetchChapters(url));
  return request<{ chapters: Chapter[] }>('/api/chapters', { url }, signal);
}

export function fetchTranscript(
  url: string,
  type?: string,
  signal?: AbortSignal,
): Promise<{ lines: TranscriptLine[]; type: string }> {
  if (LOCAL_ENGINE) return local((engine) => engine.localFetchTranscript(url, type));
  return request<{ lines: TranscriptLine[]; type: string }>(
    '/api/transcript',
    type ? { url, type } : { url },
    signal,
  );
}

export function fetchPlaylist(url: string, signal?: AbortSignal): Promise<{ stations: Station[]; playlistUrl: string }> {
  if (LOCAL_ENGINE) return local((engine) => engine.localFetchPlaylist(url));
  return request<{ stations: Station[]; playlistUrl: string }>('/api/playlist', { url }, signal);
}

export async function parsePlaylistText(text: string): Promise<Station[]> {
  if (LOCAL_ENGINE) return local((engine) => engine.localParsePlaylistText(text));
  if (STATIC_DEMO) {
    throw new ApiError('GitHub Pages 是静态演示版；本地 M3U 导入请在本机运行完整版。');
  }
  const response = await fetch(apiUrl('/api/playlist/parse').toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : 'M3U 文件解析失败。';
    throw new ApiError(message, response.status);
  }
  return (body as { stations: Station[] }).stations;
}

export async function searchPodcasts(query: string, signal?: AbortSignal): Promise<PodcastSearchResult[]> {
  if (LOCAL_ENGINE) return local((engine) => engine.localSearchPodcasts(query));
  const data = await request<{ results: PodcastSearchResult[] }>('/api/podcast/search', { q: query }, signal);
  return data.results;
}

export async function searchRadio(query: string, signal?: AbortSignal): Promise<Station[]> {
  if (LOCAL_ENGINE) return local((engine) => engine.localSearchRadio(query));
  const data = await request<{ results: Station[] }>('/api/radio/search', { q: query }, signal);
  return data.results;
}

export async function featuredRadio(signal?: AbortSignal): Promise<Station[]> {
  if (LOCAL_ENGINE) return local((engine) => engine.localFeaturedRadio());
  const data = await request<{ results: Station[] }>('/api/radio/featured', undefined, signal);
  return data.results;
}

export function isHlsUrl(url: string): boolean {
  try {
    return new URL(url, window.location.origin).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return /\.m3u8(\?|$)/i.test(url);
  }
}

export function proxiedImage(url?: string): string | undefined {
  if (!url) return undefined;
  if (STATIC_DEMO || LOCAL_ENGINE) return url;
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (!/^https?:/i.test(url)) return undefined;
  return absolutize(`/api/image?url=${encodeURIComponent(url)}`);
}

export function audioSource(url: string): string {
  if (!url) return '';
  if (STATIC_DEMO || LOCAL_ENGINE) return url;
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return absolutize(`/api/audio?url=${encodeURIComponent(url)}`);
}

export function hlsSource(url: string): string {
  // Android's WebView plays HLS natively, so no manifest rewriting is needed.
  if (STATIC_DEMO || LOCAL_ENGINE) return url;
  return absolutize(`/api/hls?url=${encodeURIComponent(url)}`);
}
