/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * HarmonyOS network bridge.
 *
 * ArkWeb has no equivalent of Capacitor's `CapacitorHttp`, so plain `fetch`
 * from a `resource://rawfile` page cannot reach podcast hosts that omit CORS
 * headers. The entry module registers an ArkTS proxy named `StayTunedHttp`
 * that performs the request natively and hands back JSON:
 *
 *   { status, headers, body, error? }
 *
 * This module turns that into a `fetch`-compatible transport so the shared
 * parser code in `server/*.mjs` runs unchanged.
 */

interface HarmonyBridgePayload {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

interface HarmonyBridge {
  request(url: string, method: string, headersJson: string, body: string): Promise<string | HarmonyBridgePayload>;
}

declare global {
  interface Window {
    StayTunedHttp?: HarmonyBridge;
  }
}

export function isHarmonyBridgeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.StayTunedHttp?.request === 'function';
}

function headersToObject(headers: RequestInit['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) result[key] = value;
    return result;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

function parsePayload(raw: string | HarmonyBridgePayload): HarmonyBridgePayload {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw) as HarmonyBridgePayload;
  } catch {
    // A non-JSON answer is still a body: treat it as a successful text reply.
    return { status: 200, body: raw };
  }
}

/** `fetch`-compatible transport backed by the ArkTS bridge. */
export async function harmonyTransport(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const bridge = typeof window === 'undefined' ? undefined : window.StayTunedHttp;
  if (!bridge) throw new Error('鸿蒙网络桥未注册。');

  const url = typeof input === 'string' ? input : input.toString();
  const method = String(init.method ?? 'GET').toUpperCase();
  const headers = headersToObject(init.headers);
  const body = typeof init.body === 'string' ? init.body : '';

  const payload = parsePayload(await bridge.request(url, method, JSON.stringify(headers), body));
  if (payload.error) throw new Error(payload.error);

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(payload.headers ?? {})) {
    if (value != null) responseHeaders.set(key, String(value));
  }

  const status = payload.status && payload.status > 0 ? payload.status : 200;
  // 204/205 must not carry a body, and Response rejects one.
  const responseBody = status === 204 || status === 205 ? null : payload.body ?? '';
  return new Response(responseBody, { status, headers: responseHeaders });
}
