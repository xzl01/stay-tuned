/* SPDX-License-Identifier: GPL-3.0-only */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

interface TransportInit {
  method?: string;
  headers?: Record<string, string>;
  redirect?: string;
  signal?: AbortSignal;
}

const TIMEOUT_MS = 20_000;

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

/**
 * A `fetch`-compatible transport backed by Capacitor's native HTTP client.
 * Native requests ignore the WebView's CORS rules, so public RSS feeds, M3U
 * playlists and directory APIs can be read directly on the device.
 */
export function nativeTransport(input: string | URL, init: TransportInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const headers = { ...(init.headers ?? {}) };

  return CapacitorHttp.request({
    url,
    method: (init.method ?? 'GET').toUpperCase(),
    headers,
    responseType: 'text',
    connectTimeout: TIMEOUT_MS,
    readTimeout: TIMEOUT_MS,
  }).then((response) => {
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers ?? {})) {
      if (value != null) responseHeaders.set(key, String(value));
    }
    if (!responseHeaders.has('content-type')) responseHeaders.set('content-type', 'text/plain; charset=utf-8');
    return new Response(body, {
      status: response.status,
      statusText: response.status >= 400 ? 'Error' : 'OK',
      headers: responseHeaders,
    });
  });
}

/** Same transport shape, but waiting for a real `Response` from the platform. */
export function webTransport(input: string | URL, init: TransportInit = {}): Promise<Response> {
  return fetch(input, init as RequestInit);
}

/** True only on a real device build, where the native HTTP bridge exists. */
export function isNativeHttpAvailable(): boolean {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
}

export { headerValue };
