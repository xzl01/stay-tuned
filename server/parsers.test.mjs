/* SPDX-License-Identifier: GPL-3.0-only */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseDuration, htmlToText } from './feed.mjs';
import { looksLikeHls, parsePlaylist } from './playlist.mjs';
import { rewriteHlsPlaylist } from './hls.mjs';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>日常之间</title>
    <description><![CDATA[<p>一档关于<strong>日常</strong>的播客。</p>]]></description>
    <link>https://example.com/show</link>
    <itunes:author>林间</itunes:author>
    <itunes:image href="https://example.com/cover.jpg" />
    <item>
      <title>在忙碌的世界里，重新找回专注</title>
      <guid isPermaLink="false">ep-128</guid>
      <pubDate>Wed, 12 Nov 2025 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>给自己一点不被打扰的时间。</p>]]></description>
      <itunes:duration>52:16</itunes:duration>
      <itunes:episode>128</itunes:episode>
      <podcast:chapters url="/chapter128.json" type="application/json+chapters" />
      <podcast:transcript url="/transcript128.vtt" type="text/vtt" language="zh" />
      <enclosure url="https://cdn.example.com/ep128.mp3" type="audio/mpeg" length="123456" />
    </item>
    <item>
      <title>Slow morning</title>
      <itunes:duration>1:02:03</itunes:duration>
      <enclosure url="/media/ep127.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

test('parses RSS podcast metadata, duration, relative enclosure URLs', () => {
  const feed = parseFeed(RSS, 'https://example.com/feed.xml');
  assert.equal(feed.show.title, '日常之间');
  assert.equal(feed.show.author, '林间');
  assert.equal(feed.show.image, 'https://example.com/cover.jpg');
  assert.equal(feed.show.description, '一档关于日常的播客。');
  assert.equal(feed.show.episodes.length, 2);
  const first = feed.show.episodes[0];
  assert.equal(first.title, '在忙碌的世界里，重新找回专注');
  assert.equal(first.duration, 3136);
  assert.equal(first.episodeNumber, 128);
  assert.equal(first.audioUrl, 'https://cdn.example.com/ep128.mp3');
  assert.equal(first.image, 'https://example.com/cover.jpg');
  assert.equal(first.chaptersUrl, 'https://example.com/chapter128.json');
  assert.equal(first.chaptersType, 'application/json+chapters');
  assert.equal(first.transcriptUrl, 'https://example.com/transcript128.vtt');
  assert.equal(first.transcriptType, 'text/vtt');
  assert.equal(first.transcriptLanguage, 'zh');
  assert.equal(feed.show.episodes[1].audioUrl, 'https://example.com/media/ep127.mp3');
});

test('parses Atom feeds with enclosure links', () => {
  const atom = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>Field Notes</title>
    <subtitle>A tiny field recording podcast.</subtitle>
    <logo>https://example.com/logo.png</logo>
    <author><name>Mori</name></author>
    <entry>
      <title>Wind over the ridge</title>
      <published>2025-01-02T03:04:05Z</published>
      <summary>Ten quiet minutes.</summary>
      <link rel="enclosure" type="audio/mpeg" href="https://cdn.example.com/wind.mp3" />
    </entry>
  </feed>`;
  const feed = parseFeed(atom, 'https://example.com/atom.xml');
  assert.equal(feed.show.title, 'Field Notes');
  assert.equal(feed.show.author, 'Mori');
  assert.equal(feed.show.episodes[0].audioUrl, 'https://cdn.example.com/wind.mp3');
  assert.equal(feed.show.episodes[0].duration, 0);
});

test('duration parser handles seconds, mm:ss and hh:mm:ss', () => {
  assert.equal(parseDuration('3721'), 3721);
  assert.equal(parseDuration('18:42'), 1122);
  assert.equal(parseDuration('01:02:03'), 3723);
  assert.equal(parseDuration('0'), 0);
  assert.equal(parseDuration('nope'), 0);
});

test('HTML notes are flattened and decoded', () => {
  assert.equal(htmlToText('<p>A &amp; B</p><p>Second&nbsp;line</p>'), 'A & B\nSecond line');
});

test('parses M3U stations with attributes, comments and relative URLs', () => {
  const m3u = `\uFEFF#EXTM3U
#EXTINF:-1 tvg-id="one" tvg-logo="https://example.com/one.png" group-title="爵士",City Jazz
https://radio.example.com/jazz.mp3
#EXTGRP:环境
#EXTINF:-1,Sleep Radio
streams/sleep.m3u8
# a comment
`;
  const stations = parsePlaylist(m3u, 'https://example.com/lists/main.m3u');
  assert.equal(stations.length, 2);
  assert.equal(stations[0].name, 'City Jazz');
  assert.equal(stations[0].group, '爵士');
  assert.equal(stations[0].logo, 'https://example.com/one.png');
  assert.equal(stations[1].url, 'https://example.com/lists/streams/sleep.m3u8');
  assert.equal(stations[1].group, '环境');
});

test('distinguishes M3U station lists from HLS manifests', () => {
  assert.equal(looksLikeHls('#EXTM3U\n#EXTINF:-1,Radio\nhttps://example.com/a.mp3'), false);
  assert.equal(looksLikeHls('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts'), true);
  assert.equal(looksLikeHls('#EXTM3U', 'https://example.com/live/index.m3u8'), true);
});

test('HLS rewrite proxies every URI and keeps tags intact', () => {
  const manifest = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:10,
segment-1.ts
#EXT-X-STREAM-INF:BANDWIDTH=128000
low/index.m3u8`;
  const out = rewriteHlsPlaylist(manifest, 'https://radio.example.com/live/main.m3u8');
  assert.match(out, /#EXT-X-KEY:METHOD=AES-128,URI="\/api\/hls\?url=https%3A%2F%2Fradio\.example\.com%2Flive%2Fkey\.bin"/);
  assert.match(out, /\/api\/hls\?url=https%3A%2F%2Fradio\.example\.com%2Flive%2Fsegment-1\.ts/);
  assert.match(out, /#EXT-X-STREAM-INF:BANDWIDTH=128000/);
  assert.match(out, /\/api\/hls\?url=https%3A%2F%2Fradio\.example\.com%2Flive%2Flow%2Findex\.m3u8/);
});
