/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * Rewrite every URI inside an HLS manifest so that hls.js can load the stream
 * through our same-origin proxy. This sidesteps missing CORS headers on many
 * Chinese and niche radio CDNs.
 */
export function rewriteHlsPlaylist(text, baseUrl) {
  const proxy = (absolute) => `/api/hls?url=${encodeURIComponent(absolute)}`;

  const resolve = (uri) => {
    try {
      return new URL(uri, baseUrl).toString();
    } catch {
      return '';
    }
  };

  const rewriteUriAttributes = (line) =>
    line.replace(/URI="([^"]+)"/g, (_, uri) => {
      const abs = resolve(uri);
      return abs ? `URI="${proxy(abs)}"` : `URI="${uri}"`;
    });

  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (/URI="/.test(trimmed)) return rewriteUriAttributes(line);
        return line;
      }
      const abs = resolve(trimmed);
      return abs ? proxy(abs) : line;
    })
    .join('\n');
}

export async function pipeUpstream(upstream, res) {
  const { Readable } = await import('node:stream');
  if (!upstream.body) {
    res.status(502).json({ error: '上游没有返回内容。' });
    return;
  }
  res.status(upstream.status);
  Readable.fromWeb(upstream.body)
    .on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.end();
    })
    .pipe(res);
}
