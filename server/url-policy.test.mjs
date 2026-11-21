/* SPDX-License-Identifier: GPL-3.0-only */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HttpError,
  assertPublicUrl,
  configureUrlPolicy,
  fetchText,
  isBlockedAddress,
  safeFetch,
  setFetchTransport,
} from './http.mjs';

function enforceStrict() {
  configureUrlPolicy({ enforce: true, allowPrivateHosts: false });
  setFetchTransport(null);
}

test('assertPublicUrl rejects loopback, private and metadata targets', async () => {
  enforceStrict();
  const blocked = [
    'http://localhost:8787/api/health',
    'http://127.0.0.1:8787/',
    'http://127.1.2.3/',
    'http://10.0.0.5/feed.xml',
    'http://172.16.4.2/',
    'http://192.168.1.20:8000/stream.mp3',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.100.100.200/',
    'http://[::1]:8787/',
    'http://[fd00:ec2::254]/',
    'http://[fe80::1]/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://intranet/feed.xml',
    'http://radio.local/stream',
  ];
  for (const target of blocked) {
    await assert.rejects(() => assertPublicUrl(target), HttpError, target);
  }
});

test('assertPublicUrl keeps public http(s) targets working', async () => {
  enforceStrict();
  const url = await assertPublicUrl('https://feeds.example.com/podcast.xml');
  assert.equal(url.hostname, 'feeds.example.com');
  await assert.rejects(() => assertPublicUrl('ftp://feeds.example.com/feed'), HttpError);
});

test('the policy is inert until the Node server enables it', async () => {
  configureUrlPolicy({ enforce: false, allowPrivateHosts: false });
  const url = await assertPublicUrl('http://192.168.1.20:8000/stream.mp3');
  assert.equal(url.hostname, '192.168.1.20');
});

test('allowPrivateHosts re-enables LAN targets but never metadata endpoints', async () => {
  configureUrlPolicy({ enforce: true, allowPrivateHosts: true });
  const lan = await assertPublicUrl('http://192.168.1.20:8000/stream.mp3');
  assert.equal(lan.port, '8000');
  await assert.rejects(() => assertPublicUrl('http://169.254.169.254/latest/meta-data/'), HttpError);
  await assert.rejects(() => assertPublicUrl('http://metadata.google.internal/'), HttpError);
});

test('isBlockedAddress handles IPv4-mapped and unique-local IPv6', () => {
  configureUrlPolicy({ enforce: true, allowPrivateHosts: false });
  assert.equal(isBlockedAddress('127.0.0.1'), true);
  assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedAddress('::ffff:8.8.8.8'), false);
  assert.equal(isBlockedAddress('fd12:3456::1'), true);
  assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
  assert.equal(isBlockedAddress('0.0.0.0'), true);
});

test('safeFetch follows public redirects and reports the final url', async () => {
  enforceStrict();
  const seen = [];
  setFetchTransport(async (input) => {
    const target = String(input);
    seen.push(target);
    if (target === 'https://feeds.example.com/old') {
      return new Response(null, { status: 302, headers: { location: '/new' } });
    }
    return new Response('body', { status: 200 });
  });
  try {
    const { response, url } = await safeFetch('https://feeds.example.com/old');
    assert.equal(url, 'https://feeds.example.com/new');
    assert.equal(await response.text(), 'body');
    assert.deepEqual(seen, ['https://feeds.example.com/old', 'https://feeds.example.com/new']);
  } finally {
    setFetchTransport(null);
  }
});

test('safeFetch refuses a redirect into private space', async () => {
  enforceStrict();
  setFetchTransport(async (input) => {
    if (String(input).startsWith('https://feeds.example.com/')) {
      return new Response(null, {
        status: 301,
        headers: { location: 'http://169.254.169.254/latest/meta-data/iam/' },
      });
    }
    return new Response('leaked', { status: 200 });
  });
  try {
    await assert.rejects(() => safeFetch('https://feeds.example.com/redirect'), HttpError);
  } finally {
    setFetchTransport(null);
  }
});

test('safeFetch stops after too many redirects', async () => {
  enforceStrict();
  setFetchTransport(async () => new Response(null, { status: 302, headers: { location: 'https://feeds.example.com/loop' } }));
  try {
    await assert.rejects(() => safeFetch('https://feeds.example.com/loop'), HttpError);
  } finally {
    setFetchTransport(null);
  }
});

test('fetchText refuses bodies larger than the limit', async () => {
  enforceStrict();
  setFetchTransport(async () => new Response('x'.repeat(4096), { status: 200 }));
  try {
    await assert.rejects(() => fetchText('https://feeds.example.com/huge', { maxBytes: 1024 }), HttpError);
  } finally {
    setFetchTransport(null);
  }
});

test('fetchText surfaces the upstream status as an HttpError', async () => {
  enforceStrict();
  setFetchTransport(async () => new Response('nope', { status: 404 }));
  try {
    await assert.rejects(() => fetchText('https://feeds.example.com/missing'), (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 502);
      return true;
    });
  } finally {
    setFetchTransport(null);
  }
});
