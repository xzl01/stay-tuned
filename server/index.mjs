/* SPDX-License-Identifier: GPL-3.0-only */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError, USER_AGENT, assertHttpUrl, fetchJson, fetchText, hashId } from './http.mjs';
import { FEATURED_STATIONS, ITUNES_SEARCH_ENDPOINT, RADIO_MIRRORS, mapItunesPodcast, normalizeStation } from './catalog.mjs';
import { fetchFeed } from './feed.mjs';
import { fetchPlaylist, parsePlaylist } from './playlist.mjs';
import { parseChapters, parseTranscript } from './extras.mjs';
import { pipeUpstream, rewriteHlsPlaylist } from './hls.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');

// The packaged Android app runs from the WebView origin https://localhost, so
// every API call is cross-origin. CORS defaults to open for this local-first
// proxy; set CORS_ORIGINS="https://a.example,https://b.example" to restrict it.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (CORS_ORIGINS.length) {
    if (origin && CORS_ORIGINS.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
    }
  } else {
    res.setHeader('access-control-allow-origin', '*');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,HEAD,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,accept,range,if-none-match');
  res.setHeader('access-control-expose-headers', 'content-length,content-range,accept-ranges,etag');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// Tiny in-memory caches. This is a single-user local-first app: no redis needed.
// ---------------------------------------------------------------------------
const cache = new Map();
const CACHE_LIMITS = { feed: 120, playlist: 80, search: 120, imageBytes: 24 * 1024 * 1024 };
let imageBytes = 0;

async function cached(key, ttlMs, producer) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await producer();
  cache.set(key, { value, expires: now + ttlMs });
  // Opportunistic pruning keeps the process small.
  if (cache.size > 240) {
    for (const [entryKey, entry] of cache) {
      if (entry.expires <= now) cache.delete(entryKey);
    }
  }
  return value;
}

function publicBase(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'stay-tuned', version: '1.0.0', uptime: process.uptime() });
});

// ---------------------------------------------------------------------------
// RSS podcast feeds
// ---------------------------------------------------------------------------
app.get('/api/feed', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, 'RSS 地址').toString();
    const force = req.query.refresh === '1';
    if (force) cache.delete(`feed:${url}`);
    const data = await cached(`feed:${url}`, 5 * 60 * 1000, async () => {
      const feed = await fetchFeed(url);
      if (!feed.show.episodes.length) {
        throw new HttpError(422, '这个订阅源里没有找到可播放的音频单集。');
      }
      return feed;
    });
    res.set('cache-control', force ? 'no-store' : 'public, max-age=300');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// M3U radio playlists
// ---------------------------------------------------------------------------
app.get('/api/playlist', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, 'M3U 地址').toString();
    const data = await cached(`playlist:${url}`, 10 * 60 * 1000, () => fetchPlaylist(url));
    res.set('cache-control', 'public, max-age=600');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Accept a locally-chosen .m3u file. Browsers cannot fetch local files through
// the normal URL endpoint, so the client sends the text to be parsed here.
app.post('/api/playlist/parse', (req, res, next) => {
  try {
    const text = String(req.body?.text || '');
    if (!text.trim()) throw new HttpError(400, 'M3U 文件是空的。');
    if (text.length > 2 * 1024 * 1024) throw new HttpError(413, 'M3U 文件太大。');
    const stations = parsePlaylist(text, 'http://local.invalid/');
    if (!stations.length) throw new HttpError(422, '这个 M3U 文件里没有可播放的电台地址。');
    res.json({ stations, playlistUrl: 'local-file' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Same-origin audio proxy. Accepts Range requests so seeking still works.
// ---------------------------------------------------------------------------
app.get('/api/audio', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, '音频地址').toString();
    const headers = {
      'user-agent': USER_AGENT,
      accept: '*/*',
    };
    if (req.headers.range) headers.range = req.headers.range;
    if (req.headers['if-range']) headers['if-range'] = req.headers['if-range'];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let upstream;
    try {
      upstream = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok && upstream.status !== 206) {
      throw new HttpError(502, `音频源返回 ${upstream.status}，可能暂时不可用。`);
    }

    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag']) {
      const value = upstream.headers.get(header);
      if (value) res.set(header, value);
    }
    if (!upstream.headers.get('content-type')) res.set('content-type', 'audio/mpeg');
    res.set('cache-control', 'no-cache');
    res.set('access-control-allow-origin', '*');
    await pipeUpstream(upstream, res);
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// HLS proxy: manifests are rewritten, segments are streamed. One endpoint for
// both keeps hls.js happy even when the origin sends no CORS headers.
// ---------------------------------------------------------------------------
app.get('/api/hls', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, '串流地址').toString();
    const headers = { 'user-agent': USER_AGENT, accept: '*/*' };
    if (req.headers.range) headers.range = req.headers.range;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let upstream;
    try {
      upstream = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok && upstream.status !== 206) {
      throw new HttpError(502, `串流源返回 ${upstream.status}。`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const pathname = new URL(url).pathname.toLowerCase();
    const mightBeManifest =
      /mpegurl|m3u/i.test(contentType) ||
      pathname.endsWith('.m3u8') ||
      pathname.endsWith('.m3u');

    if (mightBeManifest) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        res.set('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.set('cache-control', 'no-cache');
        res.set('access-control-allow-origin', '*');
        res.send(rewriteHlsPlaylist(text, upstream.url || url));
        return;
      }
      // A URL named *.m3u8 that is not a manifest: pass bytes through.
      res.set('content-type', contentType || 'application/octet-stream');
      res.send(Buffer.from(text, 'utf8'));
      return;
    }

    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
      const value = upstream.headers.get(header);
      if (value) res.set(header, value);
    }
    res.set('cache-control', 'no-cache');
    res.set('access-control-allow-origin', '*');
    await pipeUpstream(upstream, res);
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Remote cover art proxy (handles hotlink protection + mixed content)
// ---------------------------------------------------------------------------
app.get('/api/image', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, '图片地址').toString();
    const key = `image:${url}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      res.set('content-type', hit.value.type);
      res.set('cache-control', 'public, max-age=86400');
      res.send(hit.value.buffer);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'image/avif,image/webp,image/*,*/*' },
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok) throw new HttpError(502, '封面加载失败。');
    const type = upstream.headers.get('content-type') || '';
    if (!/^image\//i.test(type)) throw new HttpError(415, '远程内容不是图片。');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 6 * 1024 * 1024) throw new HttpError(413, '封面图片过大。');

    if (imageBytes + buffer.length < CACHE_LIMITS.imageBytes) {
      cache.set(key, { value: { buffer, type }, expires: Date.now() + 24 * 60 * 60 * 1000 });
      imageBytes += buffer.length;
    }
    res.set('content-type', type);
    res.set('cache-control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Podcasting 2.0 extras: chapters JSON and transcript files. These are fetched
// through the server so relative URLs and CORS policies do not break playback.
// ---------------------------------------------------------------------------
app.get('/api/chapters', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, '章节地址').toString();
    const data = await cached(`chapters:${url}`, 60 * 60 * 1000, async () => {
      const { text, buffer, contentType, finalUrl } = await fetchText(url, {
        timeout: 15_000,
        headers: { accept: 'application/json, application/json+chapters, text/plain, */*' },
      });
      if (buffer.length > 2 * 1024 * 1024) throw new HttpError(413, '章节文件过大。');
      const chapters = parseChapters(text);
      if (!chapters.length) {
        throw new HttpError(422, '这个章节文件里没有可用的章节。');
      }
      return { chapters, url: finalUrl };
    });
    res.set('cache-control', 'public, max-age=3600');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.get('/api/transcript', async (req, res, next) => {
  try {
    const url = assertHttpUrl(req.query.url, '文字稿地址').toString();
    const hintType = String(req.query.type || '').trim();
    const data = await cached(`transcript:${url}:${hintType}`, 60 * 60 * 1000, async () => {
      const { text, buffer, contentType, finalUrl } = await fetchText(url, {
        timeout: 20_000,
        headers: { accept: 'text/vtt, application/json, application/x-subrip, text/plain, text/html, */*' },
      });
      if (buffer.length > 4 * 1024 * 1024) throw new HttpError(413, '文字稿文件过大。');
      const lines = parseTranscript(text, hintType || contentType, finalUrl || url);
      if (!lines.length) throw new HttpError(422, '这个文字稿文件里没有可用的内容。');
      return { lines, type: hintType || contentType || 'text/plain', url: finalUrl || url };
    });
    res.set('cache-control', 'public, max-age=3600');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Discovery: Apple Podcasts (RSS feed URLs) + Radio Browser (live stations)
// ---------------------------------------------------------------------------
app.get('/api/podcast/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    if (q.length > 80) throw new HttpError(400, '搜索词太长。');
    const data = await cached(`itunes:${q.toLowerCase()}`, 10 * 60 * 1000, async () => {
      const url = new URL(ITUNES_SEARCH_ENDPOINT);
      url.searchParams.set('term', q);
      url.searchParams.set('media', 'podcast');
      url.searchParams.set('entity', 'podcast');
      url.searchParams.set('limit', '14');
      const json = await fetchJson(url);
      return (json.results || [])
        .map(mapItunesPodcast)
        .filter((item) => item.feedUrl && item.title);
    });
    res.json({ results: data });
  } catch (err) {
    next(err);
  }
});


app.get('/api/radio/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    if (q.length > 80) throw new HttpError(400, '搜索词太长。');
    const data = await cached(`radio:${q.toLowerCase()}`, 10 * 60 * 1000, async () => {
      let lastError;
      for (const mirror of RADIO_MIRRORS) {
        try {
          const url = new URL('/json/stations/search', mirror);
          url.searchParams.set('name', q);
          url.searchParams.set('limit', '20');
          url.searchParams.set('hidebroken', 'true');
          url.searchParams.set('order', 'clickcount');
          url.searchParams.set('reverse', 'true');
          const json = await fetchJson(url, { timeout: 9_000 });
          return (Array.isArray(json) ? json : [])
            .map(normalizeStation)
            .filter((station) => station.url);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error('电台目录暂不可用。');
    });
    res.json({ results: data });
  } catch (err) {
    next(err);
  }
});

// A small, hand-picked set of reliable public streams for first-run discovery.
app.get('/api/radio/featured', (_req, res) => {
  res.json({ results: FEATURED_STATIONS });
});

// ---------------------------------------------------------------------------
// Static production bundle + SPA fallback
// ---------------------------------------------------------------------------
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(new HttpError(404, '接口不存在。'));
  }
  next();
});

app.use((err, _req, res, _next) => {
  const status = Number(err.status) || 500;
  if (status >= 500) {
    console.error('[stay-tuned]', err.message);
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({
    error: err.message || '服务器开小差了，请稍后重试。',
  });
});

app.listen(PORT, HOST, () => {
  console.log(`留频 API ready on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.log('开发模式：请另开终端运行 vite（或直接 npm run dev）。');
  }
});
