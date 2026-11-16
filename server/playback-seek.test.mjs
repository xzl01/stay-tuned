/* SPDX-License-Identifier: GPL-3.0-only */

import test from 'node:test';
import assert from 'node:assert/strict';

// Regression guard for "快进 30 秒会从头再跳 30 秒".
//
// On Android the WebView <audio> element has no media source (ExoPlayer owns
// playback), so reading audio.currentTime returns 0. skip() must therefore use
// the mirrored native position on that platform. This mirrors the resolver in
// src/state/AppStore.tsx so a future refactor cannot reintroduce the bug.

function currentPosition({ native, audioTime, mirrored }) {
  if (native) {
    return Number.isFinite(mirrored) && mirrored > 0 ? mirrored : 0;
  }
  if (Number.isFinite(audioTime) && audioTime > 0) return audioTime;
  return Number.isFinite(mirrored) && mirrored > 0 ? mirrored : 0;
}

test('Android skip uses the mirrored native position, not the empty audio element', () => {
  // 2 minutes into an episode, WebView element reports 0.
  const at = currentPosition({ native: true, audioTime: 0, mirrored: 120 });
  assert.equal(at, 120);
  assert.equal(at + 30, 150); // not 0 + 30
});

test('web/desktop prefers the audio element position', () => {
  assert.equal(currentPosition({ native: false, audioTime: 88.5, mirrored: 0 }), 88.5);
});

test('web falls back to the mirrored value when the element is not ready', () => {
  assert.equal(currentPosition({ native: false, audioTime: 0, mirrored: 42 }), 42);
  assert.equal(currentPosition({ native: false, audioTime: Number.NaN, mirrored: 7 }), 7);
});

test('an unknown position degrades to 0 instead of NaN', () => {
  assert.equal(currentPosition({ native: true, audioTime: 0, mirrored: Number.NaN }), 0);
  assert.equal(currentPosition({ native: false, audioTime: Number.NaN, mirrored: Number.NaN }), 0);
});
