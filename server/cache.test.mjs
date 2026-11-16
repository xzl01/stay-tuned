/* SPDX-License-Identifier: GPL-3.0-only */

import test from 'node:test';
import assert from 'node:assert/strict';

// Pure helpers mirrored from src/lib/cache.ts. The cache module itself imports
// Capacitor/Vite browser modules at load time, so Node tests exercise the
// metadata/index algorithms here instead of importing it directly.

function episodeCacheKey(showId, episodeId) {
  return 'episode:' + showId + ':' + episodeId;
}

function safeName(key) {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function formatCacheSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function readIndex(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result = {};
    for (const [key, value] of Object.entries(parsed)) {
      const record = value;
      if (!record || typeof record.key !== 'string' || record.status !== 'ready') continue;
      result[key] = { status: 'ready', key: record.key };
    }
    return result;
  } catch {
    return {};
  }
}

test('episode cache key is stable and namespaced', () => {
  assert.equal(episodeCacheKey('show-1', 'ep-9'), 'episode:show-1:ep-9');
  assert.notEqual(episodeCacheKey('a', 'b'), episodeCacheKey('ab', ''));
});

test('safeName is a stable 8-char hex filename without path separators', () => {
  const a = safeName('episode:show:ep');
  assert.equal(a, safeName('episode:show:ep'));
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.notEqual(a, safeName('episode:show:other'));
  assert.equal(a.includes('/'), false);
});

test('formatCacheSize covers B / KB / MB / GB and invalid values', () => {
  assert.equal(formatCacheSize(0), '0 B');
  assert.equal(formatCacheSize(512), '512 B');
  assert.equal(formatCacheSize(2048), '2.0 KB');
  assert.equal(formatCacheSize(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatCacheSize(2 * 1024 * 1024 * 1024), '2.00 GB');
  assert.equal(formatCacheSize(Number.NaN), '0 B');
});

test('readIndex keeps only ready records and survives malformed JSON', () => {
  const raw = JSON.stringify({
    ok: { key: 'episode:a:b', status: 'ready' },
    mid: { key: 'episode:a:c', status: 'downloading' },
    bad: { key: 42, status: 'ready' },
  });
  assert.deepEqual(Object.keys(readIndex(raw)), ['ok']);
  assert.deepEqual(readIndex('not-json'), {});
  assert.deepEqual(readIndex(null), {});
});
