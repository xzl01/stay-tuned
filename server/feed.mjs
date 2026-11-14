/* SPDX-License-Identifier: GPL-3.0-only */

import { XMLParser } from 'fast-xml-parser';
import { assertHttpUrl, clampText, fetchText, hashId } from './http.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  processEntities: true,
  htmlEntities: true,
});

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(input) {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function asArray(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function nodeText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return nodeText(value[0]);
  if (typeof value === 'object') {
    return nodeText(value['#text'] ?? value['#cdata'] ?? value['#comment'] ?? '');
  }
  return '';
}

function textsOf(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(nodeText).filter(Boolean);
  const text = nodeText(value);
  return text ? [text] : [];
}

function attr(value, name) {
  if (!value || typeof value !== 'object') return '';
  return String(value[`@_${name}`] ?? '');
}

function firstAttr(items, name) {
  for (const item of asArray(items)) {
    const value = attr(item, name);
    if (value) return value;
  }
  return '';
}

function cleanInline(value) {
  return decodeEntities(nodeText(value))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToText(value, max = 4000) {
  let text = nodeText(value);
  if (!text) return '';
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeUrl(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).toString();
  } catch {
    return '';
  }
}

function findImage(channel, item, base) {
  const candidates = [
    attr(item?.['itunes:image'], 'href'),
    nodeText(item?.['itunes:image']),
    nodeText(item?.image?.url),
    attr(item?.image, 'href'),
    nodeText(item?.image),
    attr(channel?.['itunes:image'], 'href'),
    nodeText(channel?.['itunes:image']),
    nodeText(channel?.image?.url),
    attr(channel?.image, 'href'),
    nodeText(channel?.image),
    nodeText(channel?.logo),
    nodeText(channel?.icon),
  ];
  for (const candidate of candidates) {
    const url = normalizeUrl(cleanInline(candidate), base);
    if (url) return url;
  }
  return '';
}

export function parseDuration(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
  if (parts.length === 3) return Math.max(0, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
  return 0;
}

function parseDate(value) {
  const raw = cleanInline(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function findEnclosure(item, base) {
  const enclosures = asArray(item?.enclosure);
  for (const enclosure of enclosures) {
    const url = normalizeUrl(attr(enclosure, 'url') || nodeText(enclosure), base);
    const type = attr(enclosure, 'type');
    if (url && (!type || /audio|video|mpeg|mp3|m4a|ogg|opus|aac/i.test(type))) {
      return { url, type: type || '', length: Number(attr(enclosure, 'length')) || 0 };
    }
  }
  const media = asArray(item?.['media:content'] ?? item?.content);
  for (const entry of media) {
    const url = normalizeUrl(attr(entry, 'url') || nodeText(entry), base);
    const type = attr(entry, 'type');
    if (url && (!type || /audio/i.test(type))) {
      return { url, type, length: Number(attr(entry, 'length')) || 0, duration: parseDuration(attr(entry, 'duration')) };
    }
  }
  const links = asArray(item?.link);
  for (const link of links) {
    const url = normalizeUrl(attr(link, 'href') || nodeText(link), base);
    const rel = attr(link, 'rel');
    const type = attr(link, 'type');
    if (url && (rel === 'enclosure' || /audio\//i.test(type))) {
      return { url, type, length: 0, duration: 0 };
    }
  }
  return null;
}

function parseChapterHint(item) {
  const link = firstAttr(item?.['podcast:chapters'], 'url') || attr(item?.['podcast:chapters'], 'url');
  if (!link) return undefined;
  return {
    url: link,
    type: attr(item?.['podcast:chapters'], 'type') || 'application/json',
  };
}

function parseTranscriptHint(item) {
  const entries = asArray(item?.['podcast:transcript']);
  for (const entry of entries) {
    const url = attr(entry, 'url') || nodeText(entry);
    if (!url) continue;
    return { url, type: attr(entry, 'type') || 'text/vtt', language: attr(entry, 'language') || '' };
  }
  return undefined;
}

function normalizeEpisode(item, index, ctx) {
  const title = cleanInline(item.title) || cleanInline(item['itunes:title']) || `第 ${index + 1} 集`;
  const enclosure = findEnclosure(item, ctx.baseUrl);
  if (!enclosure?.url) return null;

  const description =
    htmlToText(item['content:encoded'] ?? item.description ?? item['itunes:summary'] ?? item.summary, 5000) ||
    cleanInline(item['itunes:summary'] ?? item.summary);

  const guid = cleanInline(item.guid) || cleanInline(item.id);
  const image = findImage(ctx.channel, item, ctx.baseUrl) || ctx.showImage;
  const episodeNumber = Number(nodeText(item['itunes:episode'])) || index + 1;
  const duration = parseDuration(item['itunes:duration']) || enclosure.duration || 0;
  const pubDate = parseDate(item.pubDate ?? item.published ?? item.updated);
  const explicit = /^(true|yes|explicit)$/i.test(cleanInline(item['itunes:explicit']));

  const chapterHint = parseChapterHint(item);
  const transcriptHint = parseTranscriptHint(item);

  return {
    id: hashId(guid || enclosure.url, ctx.showId),
    showId: ctx.showId,
    title: clampText(title, 240),
    description,
    audioUrl: enclosure.url,
    audioType: enclosure.type,
    duration,
    episodeNumber,
    pubDate,
    image: image || '',
    explicit,
    chaptersUrl: normalizeUrl(chapterHint?.url, ctx.baseUrl) || undefined,
    chaptersType: chapterHint?.type,
    transcriptUrl: normalizeUrl(transcriptHint?.url, ctx.baseUrl) || undefined,
    transcriptType: transcriptHint?.type,
    transcriptLanguage: transcriptHint?.language,
  };
}

function feedBase(root, finalUrl) {
  const channel = root?.rss?.channel ?? root?.feed;
  if (!channel) return '';
  const atomLinks = asArray(channel.link);
  const alternate = atomLinks.find((link) => attr(link, 'href') && (!attr(link, 'rel') || attr(link, 'rel') === 'alternate'));
  const link = attr(alternate, 'href') || nodeText(channel.link) || 'http://localhost/';
  try {
    return new URL(link, finalUrl).toString();
  } catch {
    return finalUrl;
  }
}

/** Parse an RSS 2.0 or Atom podcast feed into a stable, frontend-friendly shape. */
export function parseFeed(xml, feedUrl) {
  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    throw new Error(`无法解析 RSS：${err.message}`);
  }

  const channel = parsed?.rss?.channel ?? parsed?.feed;
  if (!channel) throw new Error('这似乎不是有效的 RSS / Atom 订阅源。');

  const baseUrl = feedBase(parsed, feedUrl);
  const isAtom = Boolean(parsed.feed);
  const feedTitle = cleanInline(channel.title) || '未命名播客';
  const feedDescription = htmlToText(channel.description ?? channel.subtitle ?? channel['itunes:summary'], 1200);
  const image = findImage(channel, null, baseUrl);
  const showId = hashId(feedUrl);
  const rawItems = asArray(isAtom ? channel.entry : channel.item).slice(0, 120);

  const episodes = rawItems
    .map((item, index) =>
      normalizeEpisode(item, index, {
        baseUrl,
        channel,
        showId,
        showImage: image,
      }),
    )
    .filter(Boolean);

  const author =
    cleanInline(channel['itunes:author']) ||
    cleanInline(channel.author?.name) ||
    cleanInline(asArray(channel.author)[0]) ||
    cleanInline(channel.creator) ||
    cleanInline(channel.owner?.name) ||
    '';

  const channelLink =
    nodeText(channel.link) ||
    attr(asArray(channel.link).find((link) => attr(link, 'href')), 'href') ||
    feedUrl;

  return {
    show: {
      id: showId,
      kind: 'podcast',
      title: clampText(feedTitle, 160),
      author: clampText(author, 80) || '未知主播',
      description: feedDescription,
      feedUrl,
      siteUrl: channelLink && channelLink !== feedUrl ? channelLink : undefined,
      image: image || '',
      category: cleanInline(channel['itunes:category']) || cleanInline(channel.category) || '',
      episodes,
      fetchedAt: new Date().toISOString(),
    },
  };
}

/** Fetch + parse a public RSS feed. */
export async function fetchFeed(rawUrl) {
  const url = assertHttpUrl(rawUrl, 'RSS 地址').toString();
  const { text, finalUrl, contentType } = await fetchText(url);
  if (/text\/html/i.test(contentType) && !/^\s*<\?xml|^\s*<rss|^\s*<feed/i.test(text)) {
    throw new Error('该地址返回的是网页而不是 RSS。请检查是否填错了订阅链接。');
  }
  return parseFeed(text, finalUrl || url);
}
