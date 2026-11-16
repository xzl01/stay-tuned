/* SPDX-License-Identifier: GPL-3.0-only */

import { Directory, Filesystem } from '@capacitor/filesystem';
import type { Episode, Show } from '../types';
import { audioSource, isHlsUrl } from './api';
import { STATIC_DEMO } from './env';
import { isNativePlatform } from './serverConfig';

/**
 * Offline episode cache.
 *
 * The audio bytes live in a platform-appropriate store and a small metadata
 * index lives in localStorage, so the UI can list/remove entries synchronously:
 *
 *   - Web / Electron / Pages: IndexedDB holds a Blob; playback uses a blob: URL.
 *   - Android (Capacitor): Capacitor Filesystem downloads straight to the
 *     app's private data dir; ExoPlayer reads the resulting file:// URI.
 *
 * Service worker caching is deliberately not used: the shell SW is network-only
 * for /api and /audio, and IndexedDB keeps cached audio independent of proxies,
 * origin ports and CORS.
 */

export interface CacheTarget {
  key: string;
  showId: string;
  episodeId: string;
  title: string;
  showTitle: string;
  audioUrl: string;
}

export interface CacheRecord {
  key: string;
  showId: string;
  episodeId: string;
  title: string;
  showTitle: string;
  /** Original enclosure URL, kept for display / re-download. */
  sourceUrl: string;
  size: number;
  createdAt: number;
  status: 'ready' | 'downloading' | 'error';
  progress: number;
  /** Android only: file:// URI consumable by ExoPlayer. */
  localUrl?: string;
  error?: string;
}

export type CacheIndex = Record<string, CacheRecord>;

const META_KEY = 'stay-tuned:cache-v1';
const DB_NAME = 'stay-tuned-audio-cache';
const DB_STORE = 'files';
const NATIVE_DIR = 'audio';

let index: CacheIndex = readIndex();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();
const objectUrls = new Set<string>();
const autoQueue: CacheTarget[] = [];
let autoPumping = false;
let dbPromise: Promise<IDBDatabase> | null = null;
/** Key whose native download is currently receiving progress events. */
let activeNativeKey = '';
/** Bumped by clearCache(); stale in-flight downloads compare against it. */
let generation = 0;

/* -------------------------------------------------------------------------- */
/* Metadata index                                                             */
/* -------------------------------------------------------------------------- */

function readIndex(): CacheIndex {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: CacheIndex = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = value as Partial<CacheRecord> | null;
      if (!record || typeof record.key !== 'string' || typeof record.sourceUrl !== 'string') continue;
      // A half-written download from a previous session is not a cache hit.
      if (record.status !== 'ready') continue;
      result[key] = {
        key: record.key,
        showId: String(record.showId ?? ''),
        episodeId: String(record.episodeId ?? ''),
        title: String(record.title ?? ''),
        showTitle: String(record.showTitle ?? ''),
        sourceUrl: record.sourceUrl,
        size: Number(record.size) || 0,
        createdAt: Number(record.createdAt) || Date.now(),
        status: 'ready',
        progress: 1,
        localUrl: typeof record.localUrl === 'string' ? record.localUrl : undefined,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function emit(): void {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(index));
  } catch {
    // Quota errors must not break playback; the in-memory index is still valid.
  }
  for (const listener of listeners) listener();
}

/** A new object identity on every change keeps useSyncExternalStore happy. */
function setRecord(key: string, record: CacheRecord | null): void {
  const next: CacheIndex = { ...index };
  if (record) next[key] = record;
  else delete next[key];
  index = next;
  emit();
}

export function subscribeCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCacheIndex(): CacheIndex {
  return index;
}


export interface CacheStatus {
  state: 'none' | 'ready' | 'downloading' | 'error';
  progress: number;
  size: number;
  localUrl?: string;
  error?: string;
}

/** Compact status for a single episode row / button. */
export function cacheStatusFor(key: string): CacheStatus {
  const record = index[key];
  if (!record) return { state: 'none', progress: 0, size: 0 };
  return {
    state: record.status,
    progress: record.progress,
    size: record.size,
    localUrl: record.localUrl,
    error: record.error,
  };
}

export function getCacheStats(source: CacheIndex = index): { count: number; bytes: number; downloading: number } {
  const records = Object.values(source);
  return {
    count: records.filter((record) => record.status === 'ready').length,
    bytes: records.reduce((total, record) => total + (record.size || 0), 0),
    downloading: records.filter((record) => record.status === 'downloading').length,
  };
}

export function isCacheAvailable(): boolean {
  if (typeof window === 'undefined' || STATIC_DEMO) return false;
  if (isNativePlatform()) return true;
  return typeof indexedDB !== 'undefined';
}

export function formatCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/* -------------------------------------------------------------------------- */
/* Targets                                                                    */
/* -------------------------------------------------------------------------- */

export function episodeCacheKey(showId: string, episodeId: string): string {
  return 'episode:' + showId + ':' + episodeId;
}

export function episodeCacheTarget(show: Show, episode: Episode): CacheTarget {
  return {
    key: episodeCacheKey(show.id, episode.id),
    showId: show.id,
    episodeId: episode.id,
    title: episode.title,
    showTitle: show.customTitle?.trim() || show.title,
    audioUrl: episode.audioUrl,
  };
}

function canCache(target: CacheTarget): boolean {
  if (!target.audioUrl) return false;
  if (/^(blob|data):/i.test(target.audioUrl)) return false;
  if (isHlsUrl(target.audioUrl)) return false; // Live / segmented streams are not offline files.
  return true;
}

function absoluteDownloadUrl(raw: string): string {
  // Desktop browsers need the same-origin proxy for CORS; Capacitor downloads
  // with a native HTTP client and should keep the publisher's original URL.
  const source = isNativePlatform() ? raw : audioSource(raw);
  try {
    return new URL(source, window.location.origin).toString();
  } catch {
    return source || raw;
  }
}

function safeName(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function nativePath(key: string): string {
  return NATIVE_DIR + '/' + safeName(key) + '.audio';
}

/* -------------------------------------------------------------------------- */
/* IndexedDB blob store (web / desktop)                                       */
/* -------------------------------------------------------------------------- */

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading, or the browser evicting storage, invalidates the
      // connection; drop the cached promise so the next call reconnects instead
      // of failing forever.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('无法打开离线缓存数据库。'));
    };
  });
  return dbPromise;
}

async function putBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('写入离线缓存失败。'));
    tx.onabort = () => reject(tx.error ?? new Error('写入离线缓存被中断。'));
  });
}

async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error('读取离线缓存失败。'));
  });
}

async function deleteBlob(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('删除离线缓存失败。'));
    tx.onabort = () => reject(tx.error ?? new Error('删除离线缓存被中断。'));
  });
}

async function clearBlobs(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('清空离线缓存失败。'));
    tx.onabort = () => reject(tx.error ?? new Error('清空离线缓存被中断。'));
  });
}

/* -------------------------------------------------------------------------- */
/* Download                                                                   */
/* -------------------------------------------------------------------------- */

function bumpProgress(key: string, progress: number, last: { value: number }): void {
  const clamped = Math.max(0, Math.min(0.99, progress));
  if (clamped - last.value < 0.04) return;
  last.value = clamped;
  const record = index[key];
  if (record) setRecord(key, { ...record, progress: clamped });
}

async function downloadWeb(key: string, raw: string): Promise<void> {
  const response = await fetch(absoluteDownloadUrl(raw));
  if (!response.ok) throw new Error('下载音频失败（HTTP ' + response.status + '）。');
  const total = Number(response.headers.get('content-length')) || 0;
  const progress = { value: 0 };
  let blob: Blob;
  if (!response.body) {
    blob = await response.blob();
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) bumpProgress(key, received / total, progress);
      }
    }
    blob = new Blob(chunks as BlobPart[], {
      type: response.headers.get('content-type') || 'audio/mpeg',
    });
  }
  try {
    await putBlob(key, blob);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'QuotaExceededError') throw new Error('本机存储空间不足，无法缓存这期节目。');
    throw error;
  }
  const record = index[key];
  if (record) setRecord(key, { ...record, size: blob.size, progress: 0.99 });
}

async function downloadNative(key: string, raw: string): Promise<void> {
  const path = nativePath(key);
  await Filesystem.mkdir({ path: NATIVE_DIR, directory: Directory.Data, recursive: true }).catch(() => undefined);
  const progress = { value: 0 };
  // The plugin emits one global 'progress' event; attribute it to the key we are
  // downloading right now so the row shows a real percentage instead of 0%.
  activeNativeKey = key;
  const handle = await Filesystem.addListener('progress', (status) => {
    if (activeNativeKey !== key) return;
    if (status.contentLength > 0) bumpProgress(key, status.bytes / status.contentLength, progress);
  }).catch(() => null);
  try {
    await Filesystem.downloadFile({
      url: absoluteDownloadUrl(raw),
      path,
      directory: Directory.Data,
      progress: true,
    });
  } finally {
    activeNativeKey = '';
    if (handle) await handle.remove().catch(() => undefined);
  }
  const stat = await Filesystem.stat({ path, directory: Directory.Data });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  const record = index[key];
  if (record) setRecord(key, { ...record, size: stat.size, localUrl: uri, progress: 0.99 });
}

async function deleteLocal(key: string): Promise<void> {
  if (isNativePlatform()) {
    await Filesystem.deleteFile({ path: nativePath(key), directory: Directory.Data }).catch(() => undefined);
  } else {
    await deleteBlob(key).catch(() => undefined);
  }
}

function isEpisodeCached(key: string): boolean {
  return Boolean(index[key]?.status === 'ready');
}

/** Download one episode. Rejects on failure so manual actions can notify. */
export async function downloadEpisode(target: CacheTarget): Promise<void> {
  if (!isCacheAvailable()) throw new Error('当前环境不支持离线缓存。');
  if (!canCache(target)) throw new Error('直播或 HLS 串流不支持离线缓存。');
  const key = target.key;
  if (isEpisodeCached(key) || inFlight.has(key)) return;
  const startedAt = generation;
  inFlight.add(key);
  setRecord(key, {
    key,
    showId: target.showId,
    episodeId: target.episodeId,
    title: target.title,
    showTitle: target.showTitle,
    sourceUrl: target.audioUrl,
    size: 0,
    createdAt: Date.now(),
    status: 'downloading',
    progress: 0,
  });
  try {
    if (isNativePlatform()) await downloadNative(key, target.audioUrl);
    else await downloadWeb(key, target.audioUrl);
    if (startedAt !== generation) {
      // The user cleared the cache while this download was running; discard the
      // result instead of resurrecting a record with no matching blob/file.
      await deleteLocal(key);
      return;
    }
    const record = index[key];
    setRecord(key, {
      ...(record ?? {
        key,
        showId: target.showId,
        episodeId: target.episodeId,
        title: target.title,
        showTitle: target.showTitle,
        sourceUrl: target.audioUrl,
        size: 0,
        createdAt: Date.now(),
        status: 'ready' as const,
        progress: 1,
      }),
      status: 'ready',
      progress: 1,
      error: undefined,
    });
  } catch (error) {
    await deleteLocal(key);
    setRecord(key, null);
    throw error instanceof Error ? error : new Error('缓存失败，请稍后重试。');
  } finally {
    inFlight.delete(key);
  }
}

export async function removeCachedEpisode(key: string): Promise<void> {
  if (inFlight.has(key)) return;
  await deleteLocal(key);
  setRecord(key, null);
}

export async function clearCache(): Promise<void> {
  generation += 1;
  autoQueue.length = 0;
  for (const key of Object.keys(index)) {
    if (inFlight.has(key)) continue;
    await deleteLocal(key);
  }
  if (!isNativePlatform()) await clearBlobs().catch(() => undefined);
  else await Filesystem.rmdir({ path: NATIVE_DIR, directory: Directory.Data, recursive: true }).catch(() => undefined);
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
  index = {};
  emit();
}

/* -------------------------------------------------------------------------- */
/* Playback URL                                                               */
/* -------------------------------------------------------------------------- */

/** Android-only synchronous URL for the native ExoPlayer payload. */
export function getNativeCachedUrl(key: string): string | null {
  const record = index[key];
  if (!record || record.status !== 'ready') return null;
  return isNativePlatform() ? record.localUrl ?? null : null;
}

/** Returns a URL the current platform's player can load, or null on a miss. */
export async function getCachedPlaybackUrl(key: string): Promise<string | null> {
  const record = index[key];
  if (!record || record.status !== 'ready') return null;
  if (isNativePlatform()) return record.localUrl ?? null;
  try {
    const blob = await getBlob(key);
    if (!blob || !blob.size) {
      // Metadata survived but the blob did not (e.g. site data was cleared).
      setRecord(key, null);
      return null;
    }
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  } catch {
    return null;
  }
}

export function releasePlaybackUrl(url: string | null): void {
  if (!url || !url.startsWith('blob:') || !objectUrls.has(url)) return;
  URL.revokeObjectURL(url);
  objectUrls.delete(url);
}

/* -------------------------------------------------------------------------- */
/* Automatic cache queue                                                      */
/* -------------------------------------------------------------------------- */

export function enqueueAutoCache(targets: CacheTarget[]): void {
  if (!isCacheAvailable()) return;
  for (const target of targets) {
    if (!canCache(target)) continue;
    if (isEpisodeCached(target.key) || inFlight.has(target.key)) continue;
    if (autoQueue.some((queued) => queued.key === target.key)) continue;
    autoQueue.push(target);
  }
  void pumpAutoCache();
}

async function pumpAutoCache(): Promise<void> {
  if (autoPumping || !isCacheAvailable()) return;
  autoPumping = true;
  try {
    while (autoQueue.length) {
      const target = autoQueue.shift()!;
      // Automatic caching never interrupts listening: serial, quiet failures.
      try {
        await downloadEpisode(target);
      } catch {
        // Keep the rest of the queue moving without a toast.
      }
    }
  } finally {
    autoPumping = false;
    if (autoQueue.length) void pumpAutoCache();
  }
}
