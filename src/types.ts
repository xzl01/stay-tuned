/* SPDX-License-Identifier: GPL-3.0-only */

/** `system` follows the OS appearance and resolves at runtime. */
export type Theme = 'light' | 'dark' | 'system';
export type Mode = 'skeuo' | 'flat';

export type CoverKind =
  | 'arch'
  | 'ridge'
  | 'window'
  | 'field'
  | 'signal'
  | 'night'
  | 'dune';

export interface Chapter {
  /** seconds */
  start: number;
  title: string;
}

export interface TranscriptLine {
  /** seconds */
  start: number;
  text: string;
}

export interface Episode {
  id: string;
  showId: string;
  title: string;
  description: string;
  audioUrl: string;
  /** seconds; 0 when the feed does not declare it */
  duration: number;
  pubDate?: string;
  episodeNumber?: number;
  image?: string;
  chapters?: Chapter[];
  transcript?: TranscriptLine[];
  transcriptUrl?: string;
  transcriptType?: string;
  transcriptLanguage?: string;
  chaptersUrl?: string;
  chaptersType?: string;
}

export interface Show {
  id: string;
  title: string;
  /** Optional user-provided name that survives feed refreshes. */
  customTitle?: string;
  author: string;
  description: string;
  image?: string;
  cover?: CoverKind;
  feedUrl?: string;
  siteUrl?: string;
  category?: string;
  fetchedAt?: string;
  episodes: Episode[];
}

export interface Station {
  id: string;
  name: string;
  url: string;
  /** Optional imported M3U playlist identity. */
  playlistId?: string;
  playlistName?: string;
  /** Original M3U URL used before explicit playlist grouping was introduced. */
  source?: string;
  /** User-uploaded cover image (data URL or remote URL). */
  customLogo?: string;
  group?: string;
  logo?: string;
  cover?: CoverKind;
  country?: string;
  tags?: string[];
  bitrate?: number;
  codec?: string;
  homepage?: string;
}

export interface EpisodeRef {
  kind: 'episode';
  showId: string;
  episodeId: string;
}

export interface RadioRef {
  kind: 'radio';
  stationId: string;
}

export type PlayableRef = EpisodeRef | RadioRef;

export interface QueueEntry {
  key: string;
  ref: PlayableRef;
  addedAt: number;
}

export interface PlayableEpisode {
  kind: 'episode';
  ref: EpisodeRef;
  key: string;
  show: Show;
  episode: Episode;
}

export interface PlayableStation {
  kind: 'radio';
  ref: RadioRef;
  key: string;
  station: Station;
}

export type Playable = PlayableEpisode | PlayableStation;

export interface Preferences {
  theme: Theme;
  mode: Mode;
  volume: number;
  rate: number;
  followTranscript: boolean;
  /** Linear-motor haptics on the Android build. Defaults to on. */
  haptics: boolean;
  /** Automatically cache new episodes when a show is added or refreshed. */
  autoCacheNewEpisodes: boolean;
  /** Automatically cache the episode that is currently playing. */
  autoCachePlaying: boolean;
  history: string[];
}

export interface PersistedState {
  version: 1;
  shows: Show[];
  stations: Station[];
  queue: QueueEntry[];
  current: PlayableRef | null;
  positions: Record<string, number>;
  favorites: string[];
  preferences: Preferences;
}

export interface PodcastSearchResult {
  id: string;
  title: string;
  author: string;
  image: string;
  genre: string;
  feedUrl: string;
  episodeCount: number;
}

export interface FeedResponse {
  show: Show & { fetchedAt?: string };
}
