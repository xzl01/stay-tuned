/* SPDX-License-Identifier: GPL-3.0-only */

import { sha1Hex } from './hash.mjs';

// Some podcast CDNs reject unknown clients outright. A conventional browser-like
// UA keeps public feeds fetchable without pretending to be a browser for anything else.
export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 StayTuned/1.0';

const DEFAULT_TIMEOUT = 18_000;

/**
 * Transport indirection: the Node server uses the platform `fetch`, while the
 * packaged app swaps in a CapacitorHttp-backed implementation so the exact same
 * parser code can run inside the WebView without CORS restrictions.
 */
let transport = (input, init) => fetch(input, init);
let installedTransport = null;

export function setFetchTransport(next) {
  installedTransport = next;
  transport = next ?? ((input, init) => fetch(input, init));
}

export function getFetchTransport() {
  return installedTransport;
}

/** Throws a readable error for anything that is not a public http(s) URL. */
export function assertHttpUrl(raw, label = '链接') {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new HttpError(400, `${label}格式不正确，请粘贴完整的 http(s) 地址。`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new HttpError(400, `${label}仅支持 http / https 协议。`);
  }
  return url;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function fetchText(url, { timeout = DEFAULT_TIMEOUT, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await transport(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/rss+xml, application/xml, text/xml, application/x-mpegURL, audio/*, text/plain, */*',
        ...headers,
      },
    });
    if (!res.ok) {
      throw new HttpError(
        502,
        `远程服务器返回 ${res.status}。请确认链接可公开访问，或稍后再试。`,
      );
    }
    const buffer = new Uint8Array(await res.arrayBuffer());
    return {
      text: new TextDecoder('utf-8').decode(buffer),
      buffer,
      contentType: res.headers.get('content-type') || '',
      finalUrl: res.url || String(url),
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') throw new HttpError(504, '远程服务响应超时，请稍后重试。');
    throw new HttpError(502, `无法读取远程内容：${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, { timeout = DEFAULT_TIMEOUT, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await transport(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
    });
    if (!res.ok) throw new HttpError(502, `远程目录服务返回 ${res.status}。`);
    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') throw new HttpError(504, '远程服务响应超时，请稍后重试。');
    throw new HttpError(502, `目录服务暂不可用：${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export function hashId(...parts) {
  return sha1Hex(parts.filter(Boolean).join('|')).slice(0, 14);
}

export function clampText(value, max = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
