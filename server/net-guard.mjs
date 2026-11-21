/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * Node-only outbound network policy.
 *
 * The proxy endpoints accept whatever URL a client sends, so without this the
 * server would happily fetch loopback services, RFC 1918 hosts or cloud
 * instance-metadata endpoints on someone else's behalf (SSRF / open proxy).
 *
 * The parsers in `server/*.mjs` are also bundled into the Android WebView, so
 * this module is imported by the Node entry point only: it is the one piece
 * that may use `node:dns`.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

import { HttpError, configureUrlPolicy, isBlockedAddress, setHostGuard } from './http.mjs';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function isEnabled(value) {
  return TRUTHY.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Turns on the URL policy for the Node proxy.
 *
 * `STAY_TUNED_ALLOW_PRIVATE_HOSTS=1` re-enables LAN media servers and local
 * devices. Cloud metadata endpoints stay blocked either way.
 */
export function installNetworkGuard(env = process.env) {
  configureUrlPolicy({
    enforce: true,
    allowPrivateHosts: isEnabled(env.STAY_TUNED_ALLOW_PRIVATE_HOSTS),
  });

  setHostGuard(async (url, label = '链接') => {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) return; // literal addresses are checked before this hook

    let records;
    try {
      records = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      throw new HttpError(502, `${label}的域名无法解析。`);
    }
    if (!records.length) throw new HttpError(502, `${label}的域名无法解析。`);

    for (const record of records) {
      if (isBlockedAddress(record.address)) {
        throw new HttpError(403, `${label}解析到内网地址（${record.address}），已拒绝访问。`);
      }
    }
  });
}
