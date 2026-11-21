/* SPDX-License-Identifier: GPL-3.0-only */

import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

interface BridgePayload {
  status: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

const TIMEOUT_MS: number = 20000;

function toRequestMethod(method: string): http.RequestMethod {
  switch (method.toUpperCase()) {
    case 'POST':
      return http.RequestMethod.POST;
    case 'PUT':
      return http.RequestMethod.PUT;
    case 'DELETE':
      return http.RequestMethod.DELETE;
    case 'HEAD':
      return http.RequestMethod.HEAD;
    case 'OPTIONS':
      return http.RequestMethod.OPTIONS;
    case 'PATCH':
      // RequestMethod has no PATCH member; PUT is the closest supported verb.
      return http.RequestMethod.PUT;
    default:
      return http.RequestMethod.GET;
  }
}

function parseHeaders(headersJson: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headersJson) return result;
  try {
    const parsed = JSON.parse(headersJson) as Record<string, string>;
    const keys = Object.keys(parsed);
    for (const key of keys) {
      const value = parsed[key];
      if (value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }
  } catch (error) {
    // Malformed header JSON simply means "no extra headers".
  }
  return result;
}

function bodyToText(result: string | Object | ArrayBuffer): string {
  if (typeof result === 'string') return result;
  if (result instanceof ArrayBuffer) {
    try {
      const decoder = util.TextDecoder.create('utf-8');
      return decoder.decodeToString(new Uint8Array(result));
    } catch (error) {
      // Undecodable bytes are not worth failing a feed over.
      return '';
    }
  }
  return JSON.stringify(result);
}

/**
 * Exposed to the page as `window.StayTunedHttp`.
 *
 * The proxy runs outside the WebView's CORS rules, which is what lets the
 * bundled parsers read public RSS feeds and radio directories on device —
 * the same role CapacitorHttp plays in the Android build.
 */
export class StayTunedHttp {
  async request(url: string, method: string, headersJson: string, body: string): Promise<string> {
    const payload: BridgePayload = { status: 0, headers: {}, body: '' };
    const client: http.HttpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: toRequestMethod(method),
        header: parseHeaders(headersJson),
        expectDataType: http.HttpDataType.STRING,
        usingCache: false,
        connectTimeout: TIMEOUT_MS,
        readTimeout: TIMEOUT_MS,
      };
      if (body) {
        options.extraData = body;
      }

      const response = await client.request(url, options);
      payload.status = response.responseCode;

      const rawHeaders = response.header as Record<string, string>;
      if (rawHeaders) {
        const keys = Object.keys(rawHeaders);
        for (const key of keys) {
          const value = rawHeaders[key];
          if (value !== undefined && value !== null) {
            payload.headers[key] = String(value);
          }
        }
      }
      payload.body = bodyToText(response.result);
    } catch (error) {
      const failure = error as BusinessError;
      payload.status = 0;
      payload.error = `${failure?.message ?? 'network error'} (code ${failure?.code ?? -1})`;
    } finally {
      client.destroy();
    }
    return JSON.stringify(payload);
  }
}
