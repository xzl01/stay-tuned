/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * Podcasting 2.0 chapter / transcript helpers.
 *
 * These are pure functions so they can be covered by the Node test runner and
 * reused by the HTTP layer. The browser does not fetch remote chapter or
 * transcript files directly; the server proxies them to avoid CORS surprises.
 */

const MAX_LINES = 4000;
const MAX_CHAPTERS = 500;
const MAX_TRANSCRIPT_CHARS = 1_200_000;

function cleanText(value, max = 4000) {
  const text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Number(raw));
  const parts = raw.split(':').map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

/** Parse a Podcasting 2.0 JSON chapters file. */
export function parseChapters(text) {
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    return [];
  }
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.chapters)
      ? data.chapters
      : Array.isArray(data?.segments)
        ? data.segments
        : [];
  const chapters = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const start = parseTime(entry.startTime ?? entry.start ?? entry.time);
    if (start == null || start < 0) continue;
    const title = cleanText(entry.title ?? entry.label ?? entry.name ?? entry.text, 240);
    chapters.push({ start, title: title || `第 ${chapters.length + 1} 章` });
    if (chapters.length >= MAX_CHAPTERS) break;
  }
  return chapters.sort((a, b) => a.start - b.start);
}

function parseCueText(block) {
  const lines = block.split('\n');
  const timeIndex = lines.findIndex((line) => line.includes('-->'));
  if (timeIndex < 0) return null;
  const match = lines[timeIndex].match(/(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*-->/);
  if (!match) return null;
  const start = parseTime(match[1]);
  if (start == null) return null;
  const body = lines
    .slice(timeIndex + 1)
    .map((line) => line.replace(/^NOTE\s.*$/i, '').trim())
    .filter(Boolean)
    .join(' ');
  const text = cleanText(body, 4000);
  return text ? { start, text } : null;
}

/** Parse WebVTT captions / transcripts. */
export function parseVtt(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '');
  // Remove the WEBVTT header and metadata blocks before splitting cues.
  const body = normalized.replace(/^WEBVTT[^\n]*\n?/i, '');
  const lines = [];
  for (const block of body.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed || /^(NOTE|STYLE|REGION|WEBVTT)\b/i.test(trimmed)) continue;
    const cue = parseCueText(trimmed);
    if (cue) lines.push(cue);
    if (lines.length >= MAX_LINES) break;
  }
  return lines.sort((a, b) => a.start - b.start);
}

/** Parse SubRip (.srt) captions. */
export function parseSrt(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lines = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const cue = parseCueText(block.trim());
    if (cue) lines.push(cue);
    if (lines.length >= MAX_LINES) break;
  }
  return lines.sort((a, b) => a.start - b.start);
}

function parseJsonTranscript(text) {
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    return [];
  }
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.segments)
      ? data.segments
      : Array.isArray(data?.lines)
        ? data.lines
        : Array.isArray(data?.transcript)
          ? data.transcript
          : [];
  const lines = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const start = parseTime(entry.startTime ?? entry.start ?? entry.time ?? entry.startSeconds);
    if (start == null || start < 0) continue;
    const textValue = cleanText(entry.body ?? entry.text ?? entry.content ?? entry.line, 4000);
    if (!textValue) continue;
    lines.push({ start, text: textValue });
    if (lines.length >= MAX_LINES) break;
  }
  return lines.sort((a, b) => a.start - b.start);
}

function parsePlainText(text) {
  const cleaned = cleanText(text, 12000);
  if (!cleaned) return [];
  const paragraphs = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return [{ start: 0, text: paragraphs.join('\n\n') }];
}

/**
 * Parse a transcript from its MIME type, URL extension and actual content.
 * Timestamped formats become seekable lines; plain text stays one readable block.
 */
export function parseTranscript(text, contentType = '', url = '') {
  const source = String(text ?? '').slice(0, MAX_TRANSCRIPT_CHARS);
  if (!source.trim()) return [];
  const type = String(contentType).toLowerCase();
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return String(url).toLowerCase();
    }
  })();
  const isJson = /json/.test(type) || path.endsWith('.json');
  if (isJson) {
    const parsed = parseJsonTranscript(source);
    if (parsed.length) return parsed;
  }
  const isVtt = /vtt|webvtt/.test(type) || path.endsWith('.vtt') || /^\s*WEBVTT\b/i.test(source);
  if (isVtt) return parseVtt(source);
  const isSrt = /srt|subrip/.test(type) || path.endsWith('.srt');
  if (isSrt) return parseSrt(source);
  if (source.includes('-->')) {
    // Unknown caption MIME type but it has cue timing: accept it.
    return /WEBVTT/i.test(source) ? parseVtt(source) : parseSrt(source);
  }
  return parsePlainText(source);
}
