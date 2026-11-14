/* SPDX-License-Identifier: GPL-3.0-only */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChapters, parseTranscript } from './extras.mjs';

test('parses Podcasting 2.0 chapters and sorts by start time', () => {
  const json = JSON.stringify({
    version: '1.2.0',
    chapters: [
      { startTime: 125.5, title: '第二段', img: 'https://example.com/2.jpg' },
      { startTime: 0, title: '开场' },
      { start: '01:02:03', label: '尾声' },
      { startTime: -1, title: '忽略负时间' },
    ],
  });
  const chapters = parseChapters(json);
  assert.deepEqual(
    chapters.map((chapter) => [chapter.start, chapter.title]),
    [
      [0, '开场'],
      [125.5, '第二段'],
      [3723, '尾声'],
    ],
  );
  assert.deepEqual(parseChapters('not json'), []);
});

test('parses WebVTT transcripts into seekable lines', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.500
你好，欢迎收听。

00:00:05.000 --> 00:00:08.000 align:start
<v 主播>这是第二段。</v>

NOTE 这是注释
`;
  const lines = parseTranscript(vtt, 'text/vtt', 'https://example.com/a.vtt');
  assert.deepEqual(lines, [
    { start: 1, text: '你好，欢迎收听。' },
    { start: 5, text: '这是第二段。' },
  ]);
});

test('parses SRT and Podcasting 2.0 JSON transcripts', () => {
  const srt = `1
00:00:02,000 --> 00:00:04,000
第一句

2
00:00:04,500 --> 00:00:06,000
第二句
`;
  assert.deepEqual(parseTranscript(srt, 'application/x-subrip'), [
    { start: 2, text: '第一句' },
    { start: 4.5, text: '第二句' },
  ]);

  const json = JSON.stringify({
    version: '1.0.0',
    segments: [
      { startTime: 3, endTime: 5, speaker: 'A', body: 'JSON 第一句' },
      { startTime: 8, endTime: 10, body: 'JSON 第二句' },
    ],
  });
  assert.deepEqual(parseTranscript(json, 'application/json', 'https://example.com/t.json'), [
    { start: 3, text: 'JSON 第一句' },
    { start: 8, text: 'JSON 第二句' },
  ]);
});

test('plain text transcripts remain readable as one block', () => {
  const lines = parseTranscript('第一段\n\n第二段', 'text/plain');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].start, 0);
  assert.match(lines[0].text, /第一段/);
  assert.match(lines[0].text, /第二段/);
});
