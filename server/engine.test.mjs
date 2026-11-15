/* SPDX-License-Identifier: GPL-3.0-only */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sha1Hex } from './hash.mjs';
import { getFetchTransport, hashId, setFetchTransport } from './http.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('pure SHA-1 matches node:crypto for the id inputs the app uses', () => {
  const cases = [
    '',
    'a',
    'abc',
    'radio|https://example.com/a.mp3|Radio One',
    'itunes|https://feeds.example.com/show.xml',
    'x'.repeat(55),
    'x'.repeat(56),
    'x'.repeat(64),
    'x'.repeat(1000),
    '中文|🎧|mixed content',
  ];
  for (const input of cases) {
    assert.equal(sha1Hex(input), createHash('sha1').update(input).digest('hex'));
  }
});

test('hashId keeps its published shape and value', () => {
  const id = hashId('radio', 'https://example.com/stream.mp3', 'Example Radio');
  assert.equal(id.length, 14);
  assert.match(id, /^[0-9a-f]{14}$/);
  assert.equal(id, sha1Hex('radio|https://example.com/stream.mp3|Example Radio').slice(0, 14));
});

test('parser modules stay free of Node built-ins so the app can reuse them', () => {
  const portable = ['feed.mjs', 'playlist.mjs', 'extras.mjs', 'hls.mjs', 'catalog.mjs', 'http.mjs', 'hash.mjs'];
  for (const file of portable) {
    const source = fs.readFileSync(path.join(here, file), 'utf8');
    const imports = source.match(/from\s+'([^']+)'/g) ?? [];
    for (const entry of imports) {
      assert.ok(!entry.includes("'node:"), `${file} must not import a Node built-in: ${entry}`);
    }
  }
});

test('the fetch transport is swappable and restores the platform default', async () => {
  assert.equal(getFetchTransport(), null);
  const fake = async () =>
    new Response('<rss></rss>', { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  setFetchTransport(fake);
  assert.equal(getFetchTransport(), fake);
  setFetchTransport(null);
  assert.equal(getFetchTransport(), null);
});
