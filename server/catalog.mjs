/* SPDX-License-Identifier: GPL-3.0-only */

import { hashId } from './http.mjs';

// Shared by the Node API and the in-app (WebView) engine so both surfaces use
// the same directory mirrors, station normalisation and editor picks.

export const RADIO_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

export const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

/** Map one iTunes Search API row to the app's podcast result shape. */
export function mapItunesPodcast(item) {
  return {
    id: hashId('itunes', item.feedUrl || item.collectionId),
    title: item.collectionName || item.trackName || '',
    author: item.artistName || '',
    image: String(item.artworkUrl600 || item.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'),
    genre: item.primaryGenreName || '',
    feedUrl: item.feedUrl || '',
    episodeCount: item.trackCount || 0,
  };
}

export function normalizeStation(item) {
  return {
    id: hashId('radiobrowser', item.stationuuid || item.url_resolved),
    kind: 'radio',
    name: String(item.name || '').trim() || '未命名电台',
    url: item.url_resolved || item.url || '',
    group: String(item.tags || item.country || '网络电台')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' · '),
    logo: item.favicon || '',
    homepage: item.homepage || '',
    country: item.country || '',
    tags: String(item.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6),
    bitrate: Number(item.bitrate) || undefined,
    codec: item.codec || '',
    votes: Number(item.clickcount) || 0,
  };
}

export const FEATURED_STATIONS = [
  {
    id: 'feat-somafm-groove',
    kind: 'radio',
    name: 'SomaFM · Groove Salad',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    group: '环境 · 电子',
    homepage: 'https://somafm.com/groovesalad/',
    country: 'US',
    tags: ['ambient', 'downtempo', 'chill'],
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'feat-somafm-drone',
    kind: 'radio',
    name: 'SomaFM · Drone Zone',
    url: 'https://ice1.somafm.com/dronezone-128-mp3',
    group: '氛围 · 深空',
    homepage: 'https://somafm.com/dronezone/',
    country: 'US',
    tags: ['ambient', 'drone'],
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'feat-fip-jazz',
    kind: 'radio',
    name: 'FIP · Jazz',
    url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3',
    group: '爵士 · 巴黎',
    homepage: 'https://www.radiofrance.fr/fip',
    country: 'FR',
    tags: ['jazz'],
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'feat-kexp',
    kind: 'radio',
    name: 'KEXP · 90.3 FM',
    url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3',
    group: '独立 · 西雅图',
    homepage: 'https://kexp.org',
    country: 'US',
    tags: ['indie', 'alternative'],
    codec: 'MP3',
    bitrate: 128,
  },
];
