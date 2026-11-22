/* SPDX-License-Identifier: GPL-3.0-only */

import type { Episode, Show, Station } from '../types';
import type { PersistedState } from '../types';
import { assetUrl, STATIC_DEMO } from '../lib/env';

const dailyEpisodes: Episode[] = [
  {
    id: 'ep-128',
    showId: 'demo-daily',
    title: '在忙碌的世界里，重新找回专注',
    description:
      '我们总以为，专注是把时间填满。这一期，和林间一起从日常的缝隙里，重新理解注意力、留白，以及好好听完一段对话的意义。',
    audioUrl: assetUrl('audio/forest-focus.mp3'),
    duration: 3136,
    pubDate: '2026-11-12T10:00:00+08:00',
    episodeNumber: 128,
    chapters: [
      { start: 0, title: '日常的节奏' },
      { start: 1000, title: '专注与留白' },
      { start: 2070, title: '回到生活' },
    ],
    transcript: [
      { start: 42, text: '早上七点半，城市还没有完全醒过来。' },
      { start: 198, text: '林间：我们先从你每天醒来的第一个小时聊起吧。' },
      { start: 365, text: '我发现，一天里最安静的时刻，往往不是深夜。' },
      { start: 580, text: '而是那些不急着去完成什么的空隙。' },
      { start: 732, text: '比如泡一杯茶，等水汽慢慢散开。' },
      { start: 888, text: '或者只是把窗户推开，听一会儿外面的声音。' },
      { start: 1056, text: '我们总以为，专注是把时间填满。' },
      { start: 1092, text: '但很多时候，它恰恰来自留白。' },
      { start: 1122, text: '给自己一点不被打扰的时间，\n让注意力，慢慢回到生活本身。' },
      { start: 1160, text: '比如从认真听完一段对话开始。' },
      { start: 1265, text: '林间：所以留白并不是浪费时间。' },
      { start: 1420, text: '它更像是给注意力留一个转身的余地。' },
      { start: 1572, text: '我们总在训练自己更快，却很少训练自己停下来。' },
      { start: 1770, text: '有一次我在山里走了很久，什么也没听。' },
      { start: 1925, text: '那天回去之后，反而把拖了很久的事情做完了。' },
      { start: 2085, text: '也许专注不是一种用力，而是一种允许。' },
      { start: 2232, text: '允许自己只做一件事。' },
      { start: 2370, text: '允许一段时间里，世界不需要被回应。' },
      { start: 2538, text: '林间：如果听众今天只带走一个练习呢？' },
      { start: 2670, text: '那就从认真听完一段对话开始。' },
      { start: 2832, text: '不用急着给建议，也不用急着同意。' },
      { start: 2980, text: '只是听。' },
      { start: 3032, text: '今天的节目就到这里，谢谢你和我们一起留频。' },
    ],
  },
  {
    id: 'ep-127',
    showId: 'demo-daily',
    title: '把一天过慢一点：与晨间仪式聊聊',
    description: '从烧水、磨豆到推开窗，晨间的重复动作如何为一天定下速度。',
    audioUrl: assetUrl('audio/slow-morning.mp3'),
    duration: 720,
    pubDate: '2026-11-05T10:00:00+08:00',
    episodeNumber: 127,
    chapters: [
      { start: 0, title: '醒来之前' },
      { start: 260, title: '一杯手冲' },
      { start: 520, title: '把手机放远' },
    ],
    transcript: [
      { start: 20, text: '天刚亮的时候，厨房里只有水壶的声音。' },
      { start: 120, text: '林间：你的早晨通常是怎么开始的？' },
      { start: 260, text: '我会先把手机留在另一个房间。' },
      { start: 390, text: '不是为了戒断什么，只是想让第一段注意力属于自己。' },
      { start: 520, text: '一杯咖啡不需要很完美，重要的是那几分钟不用赶。' },
      { start: 648, text: '把一天过慢一点，也许就从这里开始。' },
    ],
  },
  {
    id: 'ep-126',
    showId: 'demo-daily',
    title: '声音里的城市：从街角到站台',
    description: '带上录音机，沿着一条熟悉的街走到地铁站，记录城市在一天里的声场变化。',
    audioUrl: assetUrl('audio/city-walk.mp3'),
    duration: 960,
    pubDate: '2026-10-29T10:00:00+08:00',
    episodeNumber: 126,
    chapters: [
      { start: 0, title: '站台' },
      { start: 320, title: '沿街的声音' },
      { start: 680, title: '回到房间' },
    ],
    transcript: [
      { start: 18, text: '早上八点，站台上的人都在等同一班车。' },
      { start: 140, text: '林间：如果闭上眼睛，你能听出这是哪一站吗？' },
      { start: 320, text: '报站声、刹车声，还有雨伞收起来的声音。' },
      { start: 500, text: '那些每天经过的街角，其实一直在说话。' },
      { start: 680, text: '傍晚回到房间，城市的回声还留在耳朵里。' },
      { start: 840, text: '声音让我们记得一个地方，比照片更慢一点。' },
    ],
  },
];

export const seedShows: Show[] = [
  {
    id: 'demo-daily',
    title: '日常之间',
    author: '林间',
    description:
      '一档关于日常、注意力与生活节奏的对话节目。每周四更新，和不同的人聊聊那些容易被忽略的小事。',
    cover: 'arch',
    category: '生活 · 对话',
    siteUrl: 'https://example.com/daily',
    episodes: dailyEpisodes,
  },
  {
    id: 'demo-valley',
    title: '山谷来信',
    author: '阿岚',
    description: '把山里的风、雨和慢慢亮起来的清晨，装进一封声音来信。',
    cover: 'ridge',
    category: '自然 · 声音纪录',
    episodes: [
      {
        id: 'valley-12',
        showId: 'demo-valley',
        title: '在雨声里整理房间',
        description: '下雨的周日，适合把抽屉里的旧东西一件一件拿出来。',
        audioUrl: assetUrl('audio/slow-morning.mp3'),
        duration: 720,
        pubDate: '2026-11-09T08:00:00+08:00',
        episodeNumber: 12,
        chapters: [
          { start: 0, title: '推开门' },
          { start: 240, title: '雨落在窗台' },
          { start: 480, title: '把东西放回原处' },
        ],
        transcript: [
          { start: 12, text: '今天的山谷下了一整夜的雨。' },
          { start: 180, text: '我把书架最下面一格的东西全部拿了出来。' },
          { start: 390, text: '有些东西已经很久没有用过，但还是舍不得丢。' },
          { start: 560, text: '雨声替这个下午留出了很长的空白。' },
        ],
      },
      {
        id: 'valley-11',
        showId: 'demo-valley',
        title: '写给三年后的自己',
        description: '一封没有寄出的信，和一段关于时间的声音。',
        audioUrl: assetUrl('audio/city-walk.mp3'),
        duration: 960,
        pubDate: '2026-11-02T08:00:00+08:00',
        episodeNumber: 11,
        chapters: [
          { start: 0, title: '写信' },
          { start: 360, title: '三年有多远' },
          { start: 720, title: '封存' },
        ],
        transcript: [
          { start: 30, text: '如果现在给三年后的自己写一封信，你会说什么？' },
          { start: 220, text: '我大概会问：你现在还会为一场日落停下来吗？' },
          { start: 480, text: '希望你没有变得更忙，只是更清楚在忙什么。' },
          { start: 760, text: '信写完了，山谷里的天也黑了。' },
        ],
      },
    ],
  },
  {
    id: 'demo-studio',
    title: '胶片与咖啡',
    author: '周野',
    description: '关于相机、暗房、街角和一杯咖啡的慢节目。',
    cover: 'window',
    category: '摄影 · 城市',
    episodes: [
      {
        id: 'studio-33',
        showId: 'demo-studio',
        title: '一卷冬天的城市',
        description: '在光线最短的季节里，带着一卷胶片穿过城市。',
        audioUrl: assetUrl('audio/city-walk.mp3'),
        duration: 960,
        pubDate: '2026-11-08T18:00:00+08:00',
        episodeNumber: 33,
        chapters: [
          { start: 0, title: '装片' },
          { start: 420, title: '街角的光' },
          { start: 760, title: '冲洗之前' },
        ],
        transcript: [
          { start: 24, text: '冬天下午三点的光，已经有点像傍晚了。' },
          { start: 260, text: '我喜欢在便利店门口等一会儿，看人从光里走过。' },
          { start: 540, text: '一卷三十六张，拍到第三十张的时候开始舍不得。' },
          { start: 830, text: '在冲洗出来之前，这卷城市还只属于我。' },
        ],
      },
      {
        id: 'studio-32',
        showId: 'demo-studio',
        title: '暗房里的下午',
        description: '红色安全灯下，影像慢慢浮出来的那几个小时。',
        audioUrl: assetUrl('audio/slow-morning.mp3'),
        duration: 720,
        pubDate: '2026-10-30T18:00:00+08:00',
        episodeNumber: 32,
        chapters: [
          { start: 0, title: '关灯' },
          { start: 260, title: '显影' },
          { start: 520, title: '晾干' },
        ],
        transcript: [
          { start: 16, text: '暗房里只能听见定时器和水流的声音。' },
          { start: 210, text: '药水里的纸开始出现模糊的轮廓。' },
          { start: 430, text: '那一刻总是很安静，像在等一个答案。' },
          { start: 640, text: '照片晾干以后，下午也结束了。' },
        ],
      },
    ],
  },
];

export const seedStations: Station[] = [
  {
    id: 'feat-fip-jazz',
    name: 'FIP · Jazz',
    url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3',
    group: '爵士 · 巴黎',
    homepage: 'https://www.radiofrance.fr/fip',
    country: 'FR',
    tags: ['jazz', 'live'],
    codec: 'MP3',
    bitrate: 128,
    cover: 'night',
  },
  {
    id: 'feat-somafm-groove',
    name: 'SomaFM · Groove Salad',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    group: '环境 · 电子',
    homepage: 'https://somafm.com/groovesalad/',
    country: 'US',
    tags: ['ambient', 'downtempo'],
    codec: 'MP3',
    bitrate: 128,
    cover: 'signal',
  },
  {
    id: 'feat-somafm-drone',
    name: 'SomaFM · Drone Zone',
    url: 'https://ice1.somafm.com/dronezone-128-mp3',
    group: '氛围 · 深空',
    homepage: 'https://somafm.com/dronezone/',
    country: 'US',
    tags: ['ambient', 'drone'],
    codec: 'MP3',
    bitrate: 128,
    cover: 'dune',
  },
  {
    id: 'feat-kexp',
    name: 'KEXP · 90.3 FM',
    url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3',
    group: '独立 · 西雅图',
    homepage: 'https://kexp.org',
    country: 'US',
    tags: ['indie', 'alternative'],
    codec: 'MP3',
    bitrate: 128,
    cover: 'field',
  },
];

const defaultPreferences: PersistedState['preferences'] = {
  theme: 'light',
  mode: 'skeuo',
  volume: 0.72,
  rate: 1,
  followTranscript: true,
  haptics: true,
  backScreen: true,
  autoCacheNewEpisodes: false,
  autoCachePlaying: false,
  history: [],
};

/**
 * First-run state.
 *
 * The demo podcast and the three sample stations exist only for the static
 * GitHub Pages showcase: a real install starts with an empty library so the
 * user's own subscriptions are the only thing in it.
 */
export function createEmptyState(): PersistedState {
  return {
    version: 1,
    shows: [],
    stations: [],
    queue: [],
    current: null,
    positions: {},
    favorites: [],
    preferences: { ...defaultPreferences },
  };
}

export function createSeedState(): PersistedState {
  if (!STATIC_DEMO) return createEmptyState();
  return {
    version: 1,
    shows: seedShows,
    stations: seedStations,
    queue: [
      { key: 'episode:demo-daily:ep-128', ref: { kind: 'episode', showId: 'demo-daily', episodeId: 'ep-128' }, addedAt: 1 },
      { key: 'episode:demo-daily:ep-127', ref: { kind: 'episode', showId: 'demo-daily', episodeId: 'ep-127' }, addedAt: 2 },
      { key: 'radio:feat-fip-jazz', ref: { kind: 'radio', stationId: 'feat-fip-jazz' }, addedAt: 3 },
    ],
    current: { kind: 'episode', showId: 'demo-daily', episodeId: 'ep-128' },
    positions: { 'episode:demo-daily:ep-128': 1122 },
    favorites: [],
    preferences: { ...defaultPreferences },
  };
}
