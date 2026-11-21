/* SPDX-License-Identifier: GPL-3.0-only */

import { assertHttpUrl, fetchText, hashId, safeFetch } from './http.mjs';

const AUDIO_EXTENSION = /\.(mp3|aac|m4a|ogg|opus|flac|wav|pls)(\?|$)/i;

function singleStation(url, name, contentType = '') {
  const cleanName = name || guessName(url);
  return {
    stations: [
      {
        id: hashId('radio', url, cleanName),
        kind: 'radio',
        name: cleanName,
        url,
        group: '流媒体',
        codec: /aac/i.test(contentType) ? 'AAC' : /ogg|opus/i.test(contentType) ? 'OGG' : 'MP3',
        source: url,
      },
    ],
    playlistUrl: url,
  };
}

function parseAttrs(input) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;
  let match;
  while ((match = re.exec(input))) {
    attrs[(match[1] || match[3]).toLowerCase()] = match[2] ?? match[4] ?? '';
  }
  return attrs;
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value.trim(), baseUrl).toString();
  } catch {
    return '';
  }
}

/** Parse an extended M3U / M3U8 playlist into radio stations. Pure and unit-testable. */
export function parsePlaylist(text, playlistUrl = 'http://localhost/') {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim());

  const stations = [];
  let pending = null;
  let group = '';
  let logo = '';

  for (const line of lines) {
    if (!line) continue;

    if (/^#EXTINF:/i.test(line)) {
      const body = line.slice(line.indexOf(':') + 1);
      const comma = body.indexOf(',');
      const meta = comma >= 0 ? body.slice(0, comma) : body;
      const name = comma >= 0 ? body.slice(comma + 1).trim() : '';
      const attrs = parseAttrs(meta);
      pending = {
        name: name || attrs['tvg-name'] || '',
        group: attrs['group-title'] || group,
        logo: attrs['tvg-logo'] || logo,
        duration: Number(meta.trim().split(/\s+/)[0]) || -1,
        attrs,
      };
      continue;
    }

    if (/^#EXTGRP:/i.test(line)) {
      group = line.slice(8).trim();
      continue;
    }

    if (/^#EXT-X-(STREAM-INF|MEDIA)/i.test(line)) {
      // A single HLS master playlist is still a playable "station", not a station list.
      continue;
    }

    if (line.startsWith('#')) continue;

    const url = resolveUrl(line, playlistUrl);
    if (!url) continue;

    const meta = pending ?? {};
    const name = (meta.name || guessName(url)).trim();
    if (!name) continue;

    stations.push({
      id: hashId('radio', url, name),
      kind: 'radio',
      name,
      url,
      group: meta.group || group || '未分组',
      logo: meta.logo || '',
      bitrate: Number(meta.attrs?.bitrate) || undefined,
      codec: meta.attrs?.['tvg-type'] || undefined,
      homepage: meta.attrs?.['tvg-url'] || undefined,
      source: playlistUrl,
    });
    pending = null;
    if (stations.length >= 300) break;
  }

  return stations;
}

function guessName(url) {
  try {
    const parsed = new URL(url);
    const file = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    return file.replace(/\.(m3u8?|mp3|aac|ogg|opus)$/i, '') || parsed.hostname;
  } catch {
    return '未命名电台';
  }
}

export function looksLikePlaylist(text, contentType = '') {
  const trimmed = String(text || '').trimStart();
  return /mpegurl|m3u/i.test(contentType) || trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#EXTINF');
}

export function isHlsUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith('.m3u8');
  } catch {
    return false;
  }
}

/**
 * Some servers label both M3U station lists and HLS manifests as "mpegurl".
 * Content type alone is therefore not enough; require HLS-specific tags (or a
 * .m3u8 URL) before treating the file as a single live stream.
 */
export function looksLikeHls(text, url = '') {
  if (isHlsUrl(url)) return true;
  return /#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE|PLAYLIST-TYPE|STREAM-INF|KEY|VERSION)/i.test(String(text || ''));
}

async function probeContentType(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    // Go through the shared transport: on Android a raw fetch would be blocked
    // by the WebView's CORS rules and silently fall back to "unknown type".
    const { response } = await safeFetch(
      url,
      {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 StayTuned/1.0', accept: '*/*' },
      },
      'M3U 地址',
    );
    if (!response.ok) return '';
    return response.headers.get('content-type') || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a remote M3U, returning either stations or a single direct-stream station. */
export async function fetchPlaylist(rawUrl) {
  const url = assertHttpUrl(rawUrl, 'M3U 地址').toString();

  // A direct audio stream may never end, so never buffer it just to discover its type.
  if (AUDIO_EXTENSION.test(url)) {
    return singleStation(url, guessName(url));
  }
  const hintedType = await probeContentType(url);
  if (/^audio\//i.test(hintedType) && !/mpegurl/i.test(hintedType)) {
    return singleStation(url, guessName(url), hintedType);
  }

  const { text, buffer, contentType, finalUrl } = await fetchText(url, {
    label: 'M3U 地址',
    headers: { accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, audio/*, text/plain, */*' },
  });

  const isHls = looksLikeHls(text, finalUrl || url);

  // A single HLS stream manifest can look like an M3U; it is one station, not a list.
  if (isHls) {
    let name = guessName(finalUrl || url).replace(/\.m3u8?$/i, '');
    const headerMatch = text.match(/#EXTINF:[^,]*,\s*(.+)/i);
    if (headerMatch && !/^https?:/i.test(headerMatch[1].trim())) name = headerMatch[1].trim();
    return {
      stations: [
        {
          id: hashId('radio', finalUrl || url, name),
          kind: 'radio',
          name: name || 'HLS 电台',
          url: finalUrl || url,
          group: '流媒体',
          source: finalUrl || url,
        },
      ],
      playlistUrl: finalUrl || url,
    };
  }

  if (looksLikePlaylist(text.replace(/^\uFEFF/, ''), contentType)) {
    const stations = parsePlaylist(text, finalUrl || url);
    if (!stations.length) throw new Error('M3U 中没有找到可播放的电台地址。');
    return { stations, playlistUrl: finalUrl || url };
  }

  // Direct audio stream discovered from content type / body.
  if (/^audio\//i.test(contentType) || buffer?.length > 0) {
    return singleStation(finalUrl || url, guessName(finalUrl || url), contentType);
  }

  throw new Error('无法识别该 M3U：请检查地址是否指向一个 .m3u 播放列表或音频流。');
}
