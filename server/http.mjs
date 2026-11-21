/* SPDX-License-Identifier: GPL-3.0-only */

import { sha1Hex } from './hash.mjs';

// Some podcast CDNs reject unknown clients outright. A conventional browser-like
// UA keeps public feeds fetchable without pretending to be a browser for anything else.
export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 StayTuned/1.0';

const DEFAULT_TIMEOUT = 18_000;
const MAX_REDIRECTS = 5;
/**
 * Feeds, playlists and transcripts are text. Podcast archives routinely reach
 * tens of megabytes (The Daily's feed is 20 MB), so the cap only stops runaway
 * responses rather than ordinary shows.
 */
export const MAX_TEXT_BYTES = 48 * 1024 * 1024;

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

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Outbound URL policy
//
// The Node server proxies whatever URL the client hands it, which would let a
// web page on the same network reach loopback, private ranges or cloud metadata
// endpoints. `enforce` is off by default because the Android build reuses this
// module inside the WebView, where the request comes from the user's own device.
// The Node server turns it on through `server/net-guard.mjs`.
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'instance-data', 'instance-data.ec2.internal']);

const METADATA_HOSTNAMES = new Set(['metadata.google.internal', 'metadata.goog']);

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.corp',
  '.home.arpa',
  '.lan',
];

/** Cloud instance-metadata endpoints are never a legitimate media source. */
const METADATA_ADDRESSES = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'fd00:ec2::254',
  'fe80::a9fe:a9fe',
]);

/** Loopback, link-local, CGNAT and RFC 1918 space. */
const PRIVATE_V4_RANGES = [
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
];

/** Space that must never be fetched, even when private hosts are allowed. */
const RESERVED_V4_RANGES = [
  ['0.0.0.0', 8],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

let urlPolicy = {
  /** Reject loopback / private / metadata targets. Enabled by the Node server. */
  enforce: false,
  /** Use `STAY_TUNED_ALLOW_PRIVATE_HOSTS=1` for LAN media servers. */
  allowPrivateHosts: false,
};

export function configureUrlPolicy(next = {}) {
  urlPolicy = { ...urlPolicy, ...next };
}

export function getUrlPolicy() {
  return { ...urlPolicy };
}

let hostGuard = null;

/**
 * Installed by the Node server: resolves a hostname and rejects answers inside
 * private space, which closes the "public DNS name pointing at 127.0.0.1" hole.
 */
export function setHostGuard(guard) {
  hostGuard = guard ?? null;
}

function parseIpv4(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function matchesV4(int, [base, bits]) {
  const baseInt = parseIpv4(base);
  if (baseInt === null) return false;
  const mask = bits >= 32 ? 0xffffffff : ((0xffffffff << (32 - bits)) >>> 0);
  return ((int & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

function ipv6Words(value) {
  let text = String(value).toLowerCase().replace(/^\[|\]$/g, '');
  let tail = null;
  const lastColon = text.lastIndexOf(':');
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4 = parseIpv4(maybeV4);
    if (v4 === null) return null;
    tail = [(v4 >>> 16) & 0xffff, v4 & 0xffff];
    text = `${text.slice(0, lastColon + 1)}0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':').filter(Boolean) : []) : null;
  const groups =
    rest === null ? head : [...head, ...Array(8 - head.length - rest.length).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const words = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : NaN));
  if (words.some((word) => !Number.isInteger(word))) return null;
  if (tail) {
    words[6] = tail[0];
    words[7] = tail[1];
  }
  return words;
}

export function isIpLiteral(value) {
  const host = String(value || '').replace(/^\[|\]$/g, '');
  return parseIpv4(host) !== null || host.includes(':');
}

/**
 * True for addresses a proxy should not reach. Metadata endpoints stay blocked
 * even when `allowPrivateHosts` is set.
 */
export function isBlockedAddress(address) {
  const value = String(address || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (!value) return true;
  if (METADATA_ADDRESSES.has(value)) return true;
  const allowPrivate = urlPolicy.allowPrivateHosts;

  const v4 = parseIpv4(value);
  if (v4 !== null) {
    if (RESERVED_V4_RANGES.some((range) => matchesV4(v4, range))) return true;
    if (PRIVATE_V4_RANGES.some((range) => matchesV4(v4, range))) return !allowPrivate;
    return false;
  }

  if (!value.includes(':')) return false;

  const words = ipv6Words(value);
  if (!words) return true;
  const first = words[0];

  const mapped = words.slice(0, 5).every((word) => word === 0) && (words[5] === 0xffff || words[5] === 0);
  if (mapped) {
    return isBlockedAddress(`${words[6] >>> 8}.${words[6] & 255}.${words[7] >>> 8}.${words[7] & 255}`);
  }
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x0064 && words[1] === 0xff9b) return true; // NAT64 well-known prefix
  if (first === 0x2001 && words[1] === 0x0db8) return !allowPrivate; // documentation range
  if (words.every((word) => word === 0)) return !allowPrivate; // ::
  if ((first & 0xfe00) === 0xfc00) return !allowPrivate; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return !allowPrivate; // fe80::/10 link local
  return false;
}

/** Name-based checks: localhost, mDNS, internal suffixes and single-label hosts. */
export function isBlockedHostname(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host) return true;
  if (METADATA_HOSTNAMES.has(host) || host.startsWith('metadata.')) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return !urlPolicy.allowPrivateHosts;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return !urlPolicy.allowPrivateHosts;
  // A single-label name ("intranet") can resolve anywhere through search domains.
  if (!host.includes('.') && !host.includes(':')) return !urlPolicy.allowPrivateHosts;
  return false;
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

/**
 * Protocol checks plus the outbound host policy. Every hop of a redirect goes
 * through here, so a public URL cannot bounce the proxy into private space.
 */
export async function assertPublicUrl(raw, label = '链接') {
  const url = raw instanceof URL ? raw : assertHttpUrl(raw, label);
  if (!urlPolicy.enforce) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const denied = new HttpError(
    403,
    `${label}指向本机、内网或元数据地址，已拒绝访问。如确实要代理局域网电台，请用 STAY_TUNED_ALLOW_PRIVATE_HOSTS=1 重启服务。`,
  );
  if (isBlockedHostname(host)) throw denied;
  if (isIpLiteral(host)) {
    if (isBlockedAddress(host)) throw denied;
    return url;
  }
  if (hostGuard) await hostGuard(url, label);
  return url;
}

async function readBodyWithLimit(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (maxBytes && declared > maxBytes) throw new HttpError(413, '远程内容太大，已停止读取。');

  const reader = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (maxBytes && buffer.length > maxBytes) throw new HttpError(413, '远程内容太大，已停止读取。');
    return buffer;
  }

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (maxBytes && total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The stream is already going away; nothing else to do.
      }
      throw new HttpError(413, '远程内容太大，已停止读取。');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

async function requestTransport(target, init, label) {
  try {
    return await transport(target, init);
  } catch (error) {
    // AbortError is mapped to a timeout by the callers.
    if (error && error.name === 'AbortError') throw error;
    throw new HttpError(502, `${label}无法访问：${error?.message || error}`);
  }
}

/**
 * Fetch with hand-rolled redirect handling so each hop can be re-validated.
 * Returns the response plus the URL that actually answered.
 */
export async function safeFetch(rawUrl, init = {}, label = '链接') {
  let current = assertHttpUrl(rawUrl, label);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // Re-validate on every hop: a public URL must not bounce us into private space.
    current = await assertPublicUrl(current, label);
    const response = await requestTransport(current.toString(), { ...init, redirect: 'manual' }, label);

    // A transport that hides redirect targets (browser fetch, CapacitorHttp)
    // reports status 0 or an opaque response. The request then came from the
    // user's own device, so let the platform follow it instead.
    if (!response || !response.status || response.type === 'opaqueredirect') {
      const followed = await requestTransport(current.toString(), { ...init, redirect: 'follow' }, label);
      return { response: followed, url: followed.url || current.toString() };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, url: current.toString() };
      try {
        await response.body?.cancel?.();
      } catch {
        // Ignore: the redirect body is unused either way.
      }
      let next;
      try {
        next = new URL(location, current);
      } catch {
        throw new HttpError(502, '远程服务器返回了无法识别的跳转地址。');
      }
      if (!/^https?:$/.test(next.protocol)) {
        throw new HttpError(502, '远程服务器返回了不支持的跳转协议。');
      }
      current = next;
      continue;
    }

    return { response, url: current.toString() };
  }

  throw new HttpError(508, '远程地址跳转次数过多，已停止。');
}

async function withTimeout(url, { timeout, headers, label }, consume) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const { response, url: finalUrl } = await safeFetch(
      url,
      { signal: controller.signal, headers },
      label,
    );
    return await consume(response, finalUrl);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err && err.name === 'AbortError') throw new HttpError(504, '远程服务响应超时，请稍后重试。');
    throw new HttpError(502, `无法读取远程内容：${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(
  url,
  { timeout = DEFAULT_TIMEOUT, headers = {}, maxBytes = MAX_TEXT_BYTES, label = '链接' } = {},
) {
  return withTimeout(
    url,
    {
      timeout,
      label,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/rss+xml, application/xml, text/xml, application/x-mpegURL, audio/*, text/plain, */*',
        ...headers,
      },
    },
    async (res, finalUrl) => {
      if (!res.ok) {
        throw new HttpError(502, `远程服务器返回 ${res.status}。请确认链接可公开访问，或稍后再试。`);
      }
      const buffer = await readBodyWithLimit(res, maxBytes);
      return {
        text: new TextDecoder('utf-8').decode(buffer),
        buffer,
        contentType: res.headers.get('content-type') || '',
        finalUrl,
      };
    },
  );
}

export async function fetchJson(
  url,
  { timeout = DEFAULT_TIMEOUT, headers = {}, maxBytes = MAX_TEXT_BYTES, label = '链接' } = {},
) {
  return withTimeout(
    url,
    { timeout, label, headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers } },
    async (res) => {
      if (!res.ok) throw new HttpError(502, `远程目录服务返回 ${res.status}。`);
      const buffer = await readBodyWithLimit(res, maxBytes);
      try {
        return JSON.parse(new TextDecoder('utf-8').decode(buffer));
      } catch {
        throw new HttpError(502, '远程服务返回的内容不是有效的 JSON。');
      }
    },
  );
}

export function hashId(...parts) {
  return sha1Hex(parts.filter(Boolean).join('|')).slice(0, 14);
}

export function clampText(value, max = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
