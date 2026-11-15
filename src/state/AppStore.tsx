/* SPDX-License-Identifier: GPL-3.0-only */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type Hls from 'hls.js';
import type {
  Chapter,
  Mode,
  Playable,
  PlayableRef,
  Preferences,
  Show,
  Station,
  Theme,
  TranscriptLine,
  PersistedState,
} from '../types';
import { loadPersistedState, savePersistedState, savePositions } from '../lib/storage';
import { exportBackupFile, mergeBackup, parseBackup, type ImportMode } from '../lib/backup';
import {
  audioSource,
  fetchChapters,
  fetchTranscript,
  hlsSource,
  isHlsUrl,
  useLocalEngine,
  proxiedImage,
} from '../lib/api';
import { resolvePlayable } from '../lib/refs';
import { chapterIndexAt, transcriptIndexAt } from '../lib/episode';
import { clamp } from '../lib/format';
import { feedUrlKey } from '../lib/urls';
import { initHaptics, pulse, setHapticsEnabled, setHapticsMode } from '../lib/haptics';
import { showDisplayTitle } from '../lib/shows';
import { stationImage } from '../lib/stations';
import { assetUrl, STATIC_DEMO } from '../lib/env';
import { isNativePlatform } from '../lib/serverConfig';
import { clearMediaState, onMediaAction, pushMediaState, takePendingMediaAction } from '../lib/nativeMedia';

export interface ToastMessage {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
}

export interface PlaybackSnapshot {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  error: string | null;
}

type SleepOption = { mode: 'timed'; endsAt: number } | { mode: 'end' } | null;

export type ExtraStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface EpisodeExtraStatus {
  chapter: ExtraStatus;
  transcript: ExtraStatus;
  chapterError?: string;
  transcriptError?: string;
}

interface EpisodeExtras {
  chapters?: Chapter[];
  transcript?: TranscriptLine[];
  chapterStatus: ExtraStatus;
  transcriptStatus: ExtraStatus;
  chapterError?: string;
  transcriptError?: string;
}

interface AppStoreValue {
  shows: Show[];
  stations: Station[];
  queue: PersistedState['queue'];
  positions: PersistedState['positions'];
  current: Playable | null;
  currentKey: string | null;
  favorites: string[];
  prefs: Preferences;
  /** Whether this device can play haptics at all (Android build with a motor). */
  hapticsAvailable: boolean;
  playback: PlaybackSnapshot;
  sleep: SleepOption;
  sleepRemaining: number | null;
  currentChapterIndex: number;
  currentTranscriptIndex: number;
  currentExtraStatus: EpisodeExtraStatus | null;
  spectrumReady: boolean;
  spectrumBlocked: boolean;
  readSpectrum: (data: Uint8Array) => boolean;
  toasts: ToastMessage[];

  playRef: (ref: PlayableRef) => void;
  playEpisode: (showId: string, episodeId: string) => void;
  playStation: (stationId: string) => void;
  playStationAndAdd: (station: Station) => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  skip: (seconds: number) => void;
  next: () => void;
  previous: () => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  setRate: (value: number) => void;
  toggleFavorite: (key: string) => void;
  isFavorite: (key: string) => boolean;
  setTheme: (theme: Theme) => void;
  setMode: (mode: Mode) => void;
  setFollowTranscript: (value: boolean) => void;
  setHaptics: (value: boolean) => void;
  setSleepMinutes: (minutes: number | null) => void;
  setSleepAtEpisodeEnd: () => void;
  retryCurrentExtras: () => void;
  exportBackup: () => Promise<string>;
  importBackup: (file: File, mode: ImportMode) => Promise<{ shows: number; stations: number }>;

  addShow: (show: Show, options?: { silent?: boolean }) => void;
  renameShow: (showId: string, title: string) => void;
  removeShow: (showId: string) => void;
  addStations: (stations: Station[], options?: { playlistName?: string }) => number;
  renameStationPlaylist: (playlistId: string, title: string) => void;
  renameStation: (stationId: string, title: string) => void;
  setStationCover: (stationId: string, image?: string) => void;
  removeStation: (stationId: string) => void;
  addToQueue: (ref: PlayableRef) => boolean;
  removeFromQueue: (key: string) => void;
  clearQueue: () => void;
  moveQueueItem: (key: string, direction: -1 | 1) => void;
  isQueued: (ref: PlayableRef) => boolean;

  notify: (message: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: number) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

const STATION_COVERS = ['signal', 'night', 'dune', 'field', 'window', 'ridge'] as const;

function coverForStation(name: string): (typeof STATION_COVERS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return STATION_COVERS[hash % STATION_COVERS.length];
}


function refKeyFor(ref: PlayableRef): string {
  return ref.kind === 'episode' ? `episode:${ref.showId}:${ref.episodeId}` : `radio:${ref.stationId}`;
}

function initialPlayback(data: PersistedState): PlaybackSnapshot {
  const playable = resolvePlayable(data.current, data.shows, data.stations);
  const key = playable?.key ?? '';
  const saved = data.positions[key] ?? 0;
  const duration = playable?.kind === 'episode' ? playable.episode.duration : 0;
  return {
    isPlaying: false,
    isLoading: Boolean(playable),
    currentTime: playable?.kind === 'episode' ? Math.min(saved, duration || saved) : 0,
    duration,
    buffered: 0,
    error: null,
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PersistedState>(() => loadPersistedState());
  const [playback, setPlayback] = useState<PlaybackSnapshot>(() => initialPlayback(data));
  const [sleep, setSleep] = useState<SleepOption>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [episodeExtras, setEpisodeExtras] = useState<Record<string, EpisodeExtras>>({});
  const [extrasRetryToken, setExtrasRetryToken] = useState(0);
  const [spectrumReady, setSpectrumReady] = useState(false);
  const [spectrumBlocked, setSpectrumBlocked] = useState(false);
  const [hapticsAvailable, setHapticsAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void initHaptics().then((result) => {
      if (!cancelled) setHapticsAvailable(Boolean(result?.hasVibrator));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setHapticsEnabled(data.preferences.haptics);
  }, [data.preferences.haptics]);

  useEffect(() => {
    // The flat appearance plays the same cues one notch lighter.
    setHapticsMode(data.preferences.mode);
  }, [data.preferences.mode]);

  const audioEl = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const spectrumInitRef = useRef(false);
  const corsFallbackRef = useRef<string | null>(null);
  const lastTickAtRef = useRef(0);
  const nextRef = useRef<() => void>(() => undefined);
  const previousRef = useRef<() => void>(() => undefined);
  const seekRef = useRef<(seconds: number) => void>(() => undefined);
  const hlsRef = useRef<Hls | null>(null);
  const hlsPendingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastSavedPositionRef = useRef(0);
  const toastIdRef = useRef(0);
  const lastVolumeRef = useRef(0.72);

  const dataRef = useRef(data);
  dataRef.current = data;
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const baseCurrent = useMemo(
    () => resolvePlayable(data.current, data.shows, data.stations),
    [data.current, data.shows, data.stations],
  );
  const current = useMemo<Playable | null>(() => {
    if (!baseCurrent || baseCurrent.kind !== 'episode') return baseCurrent;
    const extras = episodeExtras[baseCurrent.key];
    if (!extras) return baseCurrent;
    return {
      ...baseCurrent,
      episode: {
        ...baseCurrent.episode,
        chapters: extras.chapters ?? baseCurrent.episode.chapters,
        transcript: extras.transcript ?? baseCurrent.episode.transcript,
      },
    };
  }, [baseCurrent, episodeExtras]);
  const currentRef = useRef(current);
  currentRef.current = current;

  const currentChapterIndex = useMemo(
    () => (current?.kind === 'episode' ? chapterIndexAt(current.episode.chapters, playback.currentTime) : 0),
    [current, playback.currentTime],
  );
  const currentTranscriptIndex = useMemo(
    () => (current?.kind === 'episode' ? transcriptIndexAt(current.episode.transcript, playback.currentTime) : -1),
    [current, playback.currentTime],
  );

  const currentExtraStatus = useMemo<EpisodeExtraStatus | null>(() => {
    if (!current || current.kind !== 'episode') return null;
    const extras = episodeExtras[current.key];
    return {
      chapter:
        extras?.chapterStatus ??
        (current.episode.chapters?.length
          ? 'ready'
          : current.episode.chaptersUrl
            ? 'loading'
            : 'empty'),
      transcript:
        extras?.transcriptStatus ??
        (current.episode.transcript?.length
          ? 'ready'
          : current.episode.transcriptUrl
            ? 'loading'
            : 'empty'),
      chapterError: extras?.chapterError,
      transcriptError: extras?.transcriptError,
    };
  }, [current, episodeExtras]);

  const notify = useCallback((message: string, tone: ToastMessage['tone'] = 'default') => {
    const id = ++toastIdRef.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    if (tone === 'success') pulse('success');
    else if (tone === 'error') pulse('error');
    window.setTimeout(() => {
      setToasts((list) => list.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  // Library writes stay rare: the dependency list only contains slices that a
  // progress update does not touch.
  useEffect(() => {
    const timer = window.setTimeout(() => savePersistedState(dataRef.current), 400);
    return () => window.clearTimeout(timer);
  }, [data.shows, data.stations, data.queue, data.current, data.favorites, data.preferences]);

  // Progress is small and separate; flush it slowly while playing and right away
  // when the app is hidden.
  useEffect(() => {
    const timer = window.setTimeout(() => savePositions(dataRef.current.positions), 4000);
    return () => window.clearTimeout(timer);
  }, [data.positions]);

  const episodeExtrasRef = useRef(episodeExtras);
  episodeExtrasRef.current = episodeExtras;

  // Chapters and transcripts are episode-specific. Fetch them once per episode
  // and keep them in memory; the feed itself only contains links to these files.
  useEffect(() => {
    if (!baseCurrent || baseCurrent.kind !== 'episode') return;
    const episode = baseCurrent.episode;
    const key = baseCurrent.key;
    const existing = episodeExtrasRef.current[key];
    const chapterNeeded = Boolean(
      episode.chaptersUrl &&
        !episode.chapters?.length &&
        existing?.chapterStatus !== 'loading' &&
        existing?.chapterStatus !== 'ready' &&
        existing?.chapterStatus !== 'error',
    );
    const transcriptNeeded = Boolean(
      episode.transcriptUrl &&
        !episode.transcript?.length &&
        existing?.transcriptStatus !== 'loading' &&
        existing?.transcriptStatus !== 'ready' &&
        existing?.transcriptStatus !== 'error',
    );
    if (!chapterNeeded && !transcriptNeeded) return;

    const controller = new AbortController();
    const setExtra = (patch: Partial<EpisodeExtras>) => {
      setEpisodeExtras((currentExtras) => {
        const previous = currentExtras[key] ?? {
          chapterStatus: 'idle' as const,
          transcriptStatus: 'idle' as const,
        };
        return { ...currentExtras, [key]: { ...previous, ...patch } };
      });
    };

    if (chapterNeeded || transcriptNeeded) {
      setExtra({
        ...(chapterNeeded ? { chapterStatus: 'loading' as const } : {}),
        ...(transcriptNeeded ? { transcriptStatus: 'loading' as const } : {}),
      });
    }

    if (chapterNeeded && episode.chaptersUrl) {
      fetchChapters(episode.chaptersUrl, controller.signal)
        .then(({ chapters }) => {
          if (controller.signal.aborted) return;
          setExtra({
            chapters,
            chapterStatus: chapters.length ? 'ready' : 'empty',
            chapterError: undefined,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : '章节读取失败。';
          setExtra({ chapterStatus: 'error', chapterError: message });
        });
    }

    if (transcriptNeeded && episode.transcriptUrl) {
      fetchTranscript(episode.transcriptUrl, episode.transcriptType, controller.signal)
        .then(({ lines }) => {
          if (controller.signal.aborted) return;
          setExtra({
            transcript: lines,
            transcriptStatus: lines.length ? 'ready' : 'empty',
            transcriptError: undefined,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : '文字稿读取失败。';
          setExtra({ transcriptStatus: 'error', transcriptError: message });
        });
    }

    return () => {
      controller.abort();
      // An aborted fetch must not leave a spinner stuck when the user comes back.
      setEpisodeExtras((currentExtras) => {
        const previous = currentExtras[key];
        if (!previous) return currentExtras;
        return {
          ...currentExtras,
          [key]: {
            ...previous,
            chapterStatus: previous.chapterStatus === 'loading' ? 'idle' : previous.chapterStatus,
            transcriptStatus:
              previous.transcriptStatus === 'loading' ? 'idle' : previous.transcriptStatus,
          },
        };
      });
    };
    // URL strings identify an episode's extras; retryToken allows manual retry.
  }, [baseCurrent?.key, baseCurrent?.kind === 'episode' ? baseCurrent.episode.chaptersUrl : '', baseCurrent?.kind === 'episode' ? baseCurrent.episode.transcriptUrl : '', extrasRetryToken]);

  const retryCurrentExtras = useCallback(() => {
    const key = currentRef.current?.key;
    if (!key) return;
    setEpisodeExtras((currentExtras) => ({
      ...currentExtras,
      [key]: {
        ...currentExtras[key],
        chapters: undefined,
        transcript: undefined,
        chapterStatus: 'idle',
        transcriptStatus: 'idle',
        chapterError: undefined,
        transcriptError: undefined,
      },
    }));
    setExtrasRetryToken((token) => token + 1);
  }, []);

  // Keep the tiny volume / rate values in sync with the audio element.
  useEffect(() => {
    const audio = audioEl.current;
    if (!audio) return;
    audio.volume = data.preferences.volume;
    audio.playbackRate = data.preferences.rate;
    if (data.preferences.volume > 0) lastVolumeRef.current = data.preferences.volume;
  }, [data.preferences.volume, data.preferences.rate]);

  // A single Web Audio analyser is enough for the whole app. It is created
  // lazily during the first play so browsers treat it as user-initiated, then
  // the live bars read from it without putting spectrum data into React state.
  const ensureSpectrum = useCallback(() => {
    // Creating a MediaElementAudioSource reroutes the element through Web Audio.
    // On Android the context stays suspended, which silences playback entirely,
    // and the analyser cannot read cross-origin media there anyway.
    if (STATIC_DEMO || isNativePlatform()) return;
    const context = audioContextRef.current;
    if (context) {
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      return;
    }
    if (spectrumInitRef.current) return;
    spectrumInitRef.current = true;
    const audio = audioEl.current;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio || !AudioContextClass) {
      setSpectrumReady(false);
      return;
    }
    try {
      const nextContext = new AudioContextClass();
      const source = nextContext.createMediaElementSource(audio);
      const analyser = nextContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(nextContext.destination);
      audioContextRef.current = nextContext;
      analyserRef.current = analyser;
      setSpectrumReady(true);
      if (nextContext.state === 'suspended') {
        void nextContext.resume().catch(() => undefined);
      }
    } catch {
      // Safari/older browsers or a cross-origin stream may reject the analyser.
      // The decorative bars remain as a graceful fallback.
      setSpectrumReady(false);
    }
  }, []);

  const readSpectrum = useCallback((data: Uint8Array) => {
    const analyser = analyserRef.current;
    if (!analyser) return false;
    analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
    return true;
  }, []);

  const requestPlay = useCallback(() => {
    const audio = audioEl.current;
    if (!audio) return;
    if (hlsPendingRef.current) return;
    ensureSpectrum();
    const result = audio.play();
    if (result?.catch) {
      result.catch((err: DOMException) => {
        if (err?.name === 'AbortError') return;
        setPlayback((snapshot) => ({ ...snapshot, isPlaying: false, isLoading: false }));
        if (err?.name === 'NotAllowedError') {
          notify('浏览器拦截了自动播放，请再点一次播放。', 'error');
        } else {
          notify('这段声音暂时无法播放，请稍后重试。', 'error');
        }
      });
    }
  }, [notify, ensureSpectrum]);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // hls.js can throw while tearing down a half-open stream.
      }
      hlsRef.current = null;
    }
    hlsPendingRef.current = false;
  }, []);

  // Load the selected item into the audio element (and hls.js for HLS streams).
  const currentKey = current?.key ?? null;
  useEffect(() => {
    const audio = audioEl.current;
    if (!audio) return;
    let cancelled = false;

    destroyHls();
    audio.pause();

    if (!current) {
      audio.removeAttribute('src');
      audio.load();
      setPlayback((snapshot) => ({
        ...snapshot,
        isLoading: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        buffered: 0,
      }));
      return;
    }

    const saved =
      current.kind === 'episode' ? Math.max(0, dataRef.current.positions[current.key] ?? 0) : 0;
    lastSavedPositionRef.current = saved;
    pendingSeekRef.current = saved > 0 ? saved : null;

    setPlayback((snapshot) => ({
      ...snapshot,
      isLoading: true,
      error: null,
      currentTime: saved,
      duration: current.kind === 'episode' ? current.episode.duration : 0,
      buffered: 0,
    }));

    const sourceUrl = current.kind === 'episode' ? current.episode.audioUrl : current.station.url;

    // Desktop web reads audio through our own origin, so the analyser gets clean
    // data. Android's WebView rejects CORS-mode media for many real streams (and
    // caches the failure), so playback there always loads plainly and the live
    // bars keep their decorative animation.
    const proxied = !STATIC_DEMO && !isNativePlatform();
    corsFallbackRef.current = null;
    setSpectrumBlocked(!proxied);
    if (proxied) {
      audio.crossOrigin = 'anonymous';
    } else {
      audio.removeAttribute('crossorigin');
    }

    // Android's WebView plays HLS natively; hls.js would need CORS on segments.
    if (isHlsUrl(sourceUrl) && !useLocalEngine()) {
      hlsPendingRef.current = true;
      void (async () => {
        try {
          const { default: HlsCtor } = await import('hls.js');
          if (cancelled) return;
          if (HlsCtor.isSupported()) {
            const hls = new HlsCtor({
              enableWorker: true,
              lowLatencyMode: false,
              backBufferLength: 30,
              maxBufferLength: 30,
            });
            hlsRef.current = hls;
            hls.attachMedia(audio);
            hls.on(HlsCtor.Events.MEDIA_ATTACHED, () => hls.loadSource(hlsSource(sourceUrl)));
            hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
              if (cancelled) return;
              hlsPendingRef.current = false;
              setPlayback((snapshot) => ({ ...snapshot, isLoading: false }));
              if (playbackRef.current.isPlaying) requestPlay();
            });
            hls.on(HlsCtor.Events.ERROR, (_event, detail) => {
              if (!detail.fatal || cancelled) return;
              hlsPendingRef.current = false;
              setPlayback((snapshot) => ({
                ...snapshot,
                isLoading: false,
                isPlaying: false,
                error: '串流信号中断',
              }));
              notify('串流信号中断，请稍后重试或换一个电台。', 'error');
            });
          } else {
            audio.src = hlsSource(sourceUrl);
            audio.load();
            hlsPendingRef.current = false;
            if (playbackRef.current.isPlaying) requestPlay();
          }
        } catch {
          if (!cancelled) {
            hlsPendingRef.current = false;
            setPlayback((snapshot) => ({
              ...snapshot,
              isLoading: false,
              isPlaying: false,
              error: '无法加载串流',
            }));
            notify('无法加载这个 HLS 串流。', 'error');
          }
        }
      })();
    } else {
      audio.src = audioSource(sourceUrl);
      audio.load();
    }

    return () => {
      cancelled = true;
      destroyHls();
    };
    // current identity is stable between position saves; key is the true dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  // Reflect play / pause state into the media element.
  useEffect(() => {
    const audio = audioEl.current;
    if (!audio) return;
    if (!playback.isPlaying) {
      audio.pause();
      return;
    }
    if (hlsPendingRef.current) return;
    if (!audio.currentSrc && !audio.src) return;
    requestPlay();
  }, [playback.isPlaying, currentKey, requestPlay]);

  /** Push title/artwork/position to Android once; the system interpolates the
   *  progress bar itself, so no periodic updates are needed. */
  const publishMediaState = useCallback(() => {
    const target = currentRef.current;
    if (!target) {
      clearMediaState();
      return;
    }
    const isEpisode = target.kind === 'episode';
    pushMediaState({
      title: isEpisode ? target.episode.title : target.station.name,
      subtitle: isEpisode ? showDisplayTitle(target.show) : target.station.group || '留频电台',
      isPlaying: playbackRef.current.isPlaying,
      position: playbackRef.current.currentTime,
      duration: isEpisode ? target.episode.duration || playbackRef.current.duration : 0,
      isLive: !isEpisode,
      artwork: isEpisode
        ? target.episode.image || target.show.image || ''
        : stationImage(target.station) || '',
    });
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioEl.current;
      const target = currentRef.current;
      if (!audio || !target) return;
      if (target.kind !== 'episode') {
        notify('直播节目无法快进，只能实时收听。');
        return;
      }
      const total = playbackRef.current.duration || target.episode.duration || 0;
      const position = clamp(seconds, 0, Math.max(0, total - 0.25));
      try {
        if (audio.readyState >= 1) audio.currentTime = position;
        else pendingSeekRef.current = position;
      } catch {
        pendingSeekRef.current = position;
      }
      setPlayback((snapshot) => ({ ...snapshot, currentTime: position }));
      setData((state) => ({
        ...state,
        positions: { ...state.positions, [target.key]: position },
      }));
      publishMediaState();
    },
    [notify, publishMediaState],
  );

  const skip = useCallback(
    (seconds: number) => {
      const target = currentRef.current;
      if (!target) return;
      if (target.kind !== 'episode') {
        notify('直播节目无法快进，只能实时收听。');
        return;
      }
      const currentTime = audioEl.current?.currentTime ?? playbackRef.current.currentTime;
      seek(currentTime + seconds);
    },
    [notify, seek],
  );

  const playRef = useCallback(
    (ref: PlayableRef) => {
      const resolved = resolvePlayable(ref, dataRef.current.shows, dataRef.current.stations);
      if (!resolved) {
        notify('找不到这段内容，它可能已被移除。', 'error');
        return;
      }
      const same = currentRef.current?.key === resolved.key;
      const audio = audioEl.current;
      if (same) {
        if (!resolved) return;
        setPlayback((snapshot) => ({ ...snapshot, isPlaying: true, error: null }));
        if (!playbackRef.current.isPlaying) requestPlay();
        return;
      }

      // Remember where we left the previous episode.
      if (currentRef.current?.kind === 'episode' && audio) {
        setData((state) => ({
          ...state,
          positions: {
            ...state.positions,
            [currentRef.current!.key]: audio.currentTime,
          },
        }));
      }

      setData((state) => {
        const key = resolved.key;
        let queue = state.queue;
        if (!queue.some((entry) => entry.key === key)) {
          const entry = { key, ref, addedAt: Date.now() };
          const currentIndex = state.current
            ? queue.findIndex((item) => item.key === resolvePlayable(state.current, state.shows, state.stations)?.key)
            : -1;
          if (currentIndex >= 0) {
            queue = [...queue.slice(0, currentIndex + 1), entry, ...queue.slice(currentIndex + 1)];
          } else {
            queue = [...queue, entry];
          }
        }
        return { ...state, current: ref, queue };
      });
      setPlayback((snapshot) => ({
        ...snapshot,
        isPlaying: true,
        isLoading: true,
        error: null,
        currentTime: resolved.kind === 'episode' ? dataRef.current.positions[resolved.key] ?? 0 : 0,
        duration: resolved.kind === 'episode' ? resolved.episode.duration : 0,
        buffered: 0,
      }));
    },
    [notify, requestPlay],
  );

  const playEpisode = useCallback(
    (showId: string, episodeId: string) => playRef({ kind: 'episode', showId, episodeId }),
    [playRef],
  );
  const playStation = useCallback(
    (stationId: string) => playRef({ kind: 'radio', stationId }),
    [playRef],
  );

  /** Add a discovered station and start it in one atomic update. */
  const playStationAndAdd = useCallback((station: Station) => {
    setData((state) => {
      const existing = state.stations.find(
        (item) => item.url === station.url || item.id === station.id,
      );
      const target = existing ?? { ...station, cover: station.cover ?? coverForStation(station.name) };
      const stations = existing ? state.stations : [target as Station, ...state.stations];
      const ref: PlayableRef = { kind: 'radio', stationId: target.id };
      const key = `radio:${target.id}`;
      let queue = state.queue;
      if (!queue.some((entry) => entry.key === key)) {
        const entry = { key, ref, addedAt: Date.now() };
        const currentIndex = state.current
          ? queue.findIndex((item) => item.key === refKeyFor(item.ref))
          : -1;
        queue =
          currentIndex >= 0
            ? [...queue.slice(0, currentIndex + 1), entry, ...queue.slice(currentIndex + 1)]
            : [...queue, entry];
      }
      return { ...state, stations, current: ref, queue };
    });
    setPlayback((snapshot) => ({
      ...snapshot,
      isPlaying: true,
      isLoading: true,
      currentTime: 0,
      duration: 0,
      error: null,
      buffered: 0,
    }));
  }, []);

  const pause = useCallback(() => {
    audioEl.current?.pause();
    setPlayback((snapshot) => ({ ...snapshot, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    const target = currentRef.current;
    if (!target) {
      const first = dataRef.current.queue[0];
      if (first) playRef(first.ref);
      return;
    }
    if (playbackRef.current.isPlaying) {
      pause();
    } else {
      setPlayback((snapshot) => ({ ...snapshot, isPlaying: true, error: null }));
      const audio = audioEl.current;
      if (audio?.ended) {
        try {
          audio.currentTime = 0;
        } catch {
          // ignore
        }
      }
    }
  }, [pause, playRef]);

  const next = useCallback(() => {
    const state = dataRef.current;
    const key = currentRef.current?.key;
    const queue = state.queue;
    const index = key ? queue.findIndex((entry) => entry.key === key) : -1;
    const target = index >= 0 ? queue[index + 1] : queue[0];
    if (target) {
      playRef(target.ref);
    } else {
      notify('播放队列已经到末尾。');
    }
  }, [notify, playRef]);

  const previous = useCallback(() => {
    const audio = audioEl.current;
    if (audio && audio.currentTime > 5 && currentRef.current?.kind === 'episode') {
      seek(0);
      return;
    }
    const state = dataRef.current;
    const key = currentRef.current?.key;
    const queue = state.queue;
    const index = key ? queue.findIndex((entry) => entry.key === key) : -1;
    if (index > 0) playRef(queue[index - 1].ref);
    else seek(0);
  }, [playRef, seek]);

  const setVolume = useCallback((value: number) => {
    const volume = clamp(value, 0, 1);
    setData((state) => ({
      ...state,
      preferences: { ...state.preferences, volume },
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setData((state) => {
      const volume = state.preferences.volume > 0 ? 0 : lastVolumeRef.current || 0.72;
      return { ...state, preferences: { ...state.preferences, volume } };
    });
  }, []);

  const setRate = useCallback((value: number) => {
    setData((state) => ({
      ...state,
      preferences: { ...state.preferences, rate: clamp(value, 0.5, 2) },
    }));
  }, []);

  const toggleFavorite = useCallback(
    (key: string) => {
      const exists = dataRef.current.favorites.includes(key);
      setData((state) => ({
        ...state,
        favorites: exists ? state.favorites.filter((item) => item !== key) : [...state.favorites, key],
      }));
      notify(exists ? '已从收藏中移除。' : '已收藏。', exists ? 'default' : 'success');
    },
    [notify],
  );

  const isFavorite = useCallback((key: string) => data.favorites.includes(key), [data.favorites]);

  const setTheme = useCallback((theme: Theme) => {
    setData((state) => ({ ...state, preferences: { ...state.preferences, theme } }));
  }, []);
  const setMode = useCallback((mode: Mode) => {
    setData((state) => ({ ...state, preferences: { ...state.preferences, mode } }));
  }, []);
  const setFollowTranscript = useCallback((value: boolean) => {
    setData((state) => ({
      ...state,
      preferences: { ...state.preferences, followTranscript: value },
    }));
  }, []);
  const setHaptics = useCallback((value: boolean) => {
    setData((state) => ({
      ...state,
      preferences: { ...state.preferences, haptics: value },
    }));
    if (value) {
      // Confirm the switch on the spot, even if haptics were off a moment ago.
      setHapticsEnabled(true);
      pulse('toggleOn');
    }
  }, []);

  const setSleepMinutes = useCallback((minutes: number | null) => {
    if (!minutes) {
      setSleep(null);
      setSleepRemaining(null);
      return;
    }
    const endsAt = Date.now() + minutes * 60_000;
    setSleep({ mode: 'timed', endsAt });
    setSleepRemaining(minutes * 60);
  }, []);

  const setSleepAtEpisodeEnd = useCallback(() => {
    setSleep((value) => (value?.mode === 'end' ? null : { mode: 'end' }));
    setSleepRemaining(null);
  }, []);

  useEffect(() => {
    if (!sleep || sleep.mode !== 'timed') {
      setSleepRemaining(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((sleep.endsAt - Date.now()) / 1000));
      setSleepRemaining(left);
      if (left <= 0) {
        audioEl.current?.pause();
        setPlayback((snapshot) => ({ ...snapshot, isPlaying: false }));
        setSleep(null);
        notify('定时结束，播放已暂停。');
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sleep, notify]);

  // Sleep timer is also cleared when the user manually pauses? Keep it armed;
  // a timer that fires while paused is harmless.

  const exportBackup = useCallback(async () => {
    const path = await exportBackupFile(dataRef.current);
    notify('已导出订阅配置。', 'success');
    return path;
  }, [notify]);

  const importBackup = useCallback(
    async (file: File, mode: ImportMode) => {
      const text = await file.text();
      const incoming = parseBackup(text);
      const next = mode === 'merge' ? mergeBackup(dataRef.current, incoming) : incoming;
      setData((state) => ({
        ...next,
        // Playback preferences and current item stay local.
        preferences: mode === 'merge' ? state.preferences : { ...next.preferences, theme: state.preferences.theme, mode: state.preferences.mode },
        current: mode === 'merge' ? state.current : null,
      }));
      notify(
        mode === 'merge'
          ? `已合并 ${incoming.shows.length} 档播客、${incoming.stations.length} 个电台。`
          : `已替换为 ${incoming.shows.length} 档播客、${incoming.stations.length} 个电台。`,
        'success',
      );
      return { shows: incoming.shows.length, stations: incoming.stations.length };
    },
    [notify],
  );

  const addShow = useCallback(
    (show: Show, options?: { silent?: boolean }) => {
      const existing = dataRef.current.shows.findIndex(
        (item) => item.id === show.id || (show.feedUrl && feedUrlKey(item.feedUrl) === feedUrlKey(show.feedUrl)),
      );
      setData((state) => {
        const index = state.shows.findIndex(
          (item) => item.id === show.id || (show.feedUrl && feedUrlKey(item.feedUrl) === feedUrlKey(show.feedUrl)),
        );
        if (index >= 0) {
          const shows = [...state.shows];
          const previous = state.shows[index];
          shows[index] = { ...show, id: previous.id, customTitle: previous.customTitle };
          return { ...state, shows };
        }
        return { ...state, shows: [show, ...state.shows] };
      });
      if (!options?.silent) {
        const notificationTitle =
          (existing >= 0 ? dataRef.current.shows[existing]?.customTitle?.trim() : '') || show.title;
        notify(existing >= 0 ? `已更新《${notificationTitle}》。` : `已订阅《${notificationTitle}》。`, 'success');
      }
    },
    [notify],
  );

  const renameShow = useCallback(
    (showId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        notify('订阅名称不能为空。', 'error');
        return;
      }
      const show = dataRef.current.shows.find((item) => item.id === showId);
      if (!show) {
        notify('找不到这个订阅。', 'error');
        return;
      }
      setData((state) => ({
        ...state,
        shows: state.shows.map((item) =>
          item.id === showId
            ? { ...item, customTitle: trimmed === item.title ? undefined : trimmed }
            : item,
        ),
      }));
      notify(trimmed === show.title ? '已恢复订阅源名称。' : '已重命名订阅。', 'success');
    },
    [notify],
  );

  const removeShow = useCallback(
    (showId: string) => {
      const playing = currentRef.current;
      const affected = playing?.kind === 'episode' && playing.ref.showId === showId;
      setData((state) => {
        const shows = state.shows.filter((show) => show.id !== showId);
        const queue = state.queue.filter(
          (entry) => !(entry.ref.kind === 'episode' && entry.ref.showId === showId),
        );
        const favorites = state.favorites.filter(
          (key) => !key.startsWith(`episode:${showId}:`),
        );
        return {
          ...state,
          shows,
          queue,
          favorites,
          current: affected ? null : state.current,
        };
      });
      if (affected) {
        audioEl.current?.pause();
        setPlayback((snapshot) => ({ ...snapshot, isPlaying: false, currentTime: 0, duration: 0 }));
      }
      notify('已取消订阅。');
    },
    [notify],
  );

  const addStations = useCallback(
    (stations: Station[], options?: { playlistName?: string }) => {
      const existingByUrl = new Map(
        dataRef.current.stations.map((station) => [station.url, station]),
      );
      const playlistName = options?.playlistName?.trim().slice(0, 120);
      const playlistId = playlistName
        ? `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;
      const additions: Station[] = [];
      const adoptIds = new Set<string>();
      for (const station of stations) {
        if (!station.url) continue;
        const existing = existingByUrl.get(station.url);
        if (existing) {
          // Re-importing an older, ungrouped list with a name gives those
          // stations a playlist too, without moving stations already grouped.
          if (playlistId && !existing.playlistId) adoptIds.add(existing.id);
          continue;
        }
        additions.push({
          ...station,
          cover: station.cover ?? coverForStation(station.name),
          ...(playlistId && playlistName ? { playlistId, playlistName } : {}),
        });
        existingByUrl.set(station.url, { ...station, ...(playlistId ? { playlistId } : {}) });
      }
      if (!additions.length && !adoptIds.size) return 0;
      setData((state) => ({
        ...state,
        stations: [
          ...additions,
          ...state.stations.map((station) =>
            adoptIds.has(station.id) && playlistId && playlistName
              ? { ...station, playlistId, playlistName }
              : station,
          ),
        ],
      }));
      return additions.length + adoptIds.size;
    },
    [],
  );

  const renameStationPlaylist = useCallback(
    (playlistId: string, title: string) => {
      const trimmed = title.trim().slice(0, 120);
      if (!trimmed) {
        notify('播放列表名称不能为空。', 'error');
        return;
      }
      setData((state) => ({
        ...state,
        stations: state.stations.map((station) =>
          station.playlistId === playlistId ? { ...station, playlistName: trimmed } : station,
        ),
      }));
      notify('已重命名播放列表。', 'success');
    },
    [notify],
  );

  const renameStation = useCallback(
    (stationId: string, title: string) => {
      const trimmed = title.trim().slice(0, 160);
      if (!trimmed) {
        notify('电台名称不能为空。', 'error');
        return;
      }
      setData((state) => ({
        ...state,
        stations: state.stations.map((station) =>
          station.id === stationId ? { ...station, name: trimmed } : station,
        ),
      }));
      notify('已重命名电台。', 'success');
    },
    [notify],
  );

  const setStationCover = useCallback(
    (stationId: string, image?: string) => {
      const customLogo = image?.trim() || undefined;
      setData((state) => ({
        ...state,
        stations: state.stations.map((station) =>
          station.id === stationId ? { ...station, customLogo } : station,
        ),
      }));
      notify(customLogo ? '已更新电台封面。' : '已恢复默认封面。', 'success');
    },
    [notify],
  );

  const removeStation = useCallback(
    (stationId: string) => {
      const playing = currentRef.current;
      const affected = playing?.kind === 'radio' && playing.ref.stationId === stationId;
      setData((state) => ({
        ...state,
        stations: state.stations.filter((station) => station.id !== stationId),
        queue: state.queue.filter(
          (entry) => !(entry.ref.kind === 'radio' && entry.ref.stationId === stationId),
        ),
        favorites: state.favorites.filter((key) => key !== `radio:${stationId}`),
        current: affected ? null : state.current,
      }));
      if (affected) {
        audioEl.current?.pause();
        setPlayback((snapshot) => ({ ...snapshot, isPlaying: false, currentTime: 0 }));
      }
      notify('已移除这个电台。');
    },
    [notify],
  );

  const isQueued = useCallback(
    (ref: PlayableRef) => {
      const key = ref.kind === 'episode' ? `episode:${ref.showId}:${ref.episodeId}` : `radio:${ref.stationId}`;
      return data.queue.some((entry) => entry.key === key);
    },
    [data.queue],
  );

  const addToQueue = useCallback(
    (ref: PlayableRef) => {
      const key = ref.kind === 'episode' ? `episode:${ref.showId}:${ref.episodeId}` : `radio:${ref.stationId}`;
      if (dataRef.current.queue.some((entry) => entry.key === key)) return false;
      setData((state) => ({
        ...state,
        queue: [...state.queue, { key, ref, addedAt: Date.now() }],
      }));
      return true;
    },
    [],
  );

  const removeFromQueue = useCallback((key: string) => {
    setData((state) => ({ ...state, queue: state.queue.filter((entry) => entry.key !== key) }));
  }, []);

  const clearQueue = useCallback(() => {
    setData((state) => ({ ...state, queue: [] }));
  }, []);

  const moveQueueItem = useCallback((key: string, direction: -1 | 1) => {
    setData((state) => {
      const index = state.queue.findIndex((entry) => entry.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.queue.length) return state;
      const queue = [...state.queue];
      [queue[index], queue[target]] = [queue[target], queue[index]];
      return { ...state, queue };
    });
  }, []);

  // Media Session: lock-screen / OS media keys support on desktop and mobile.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    const title = current.kind === 'episode' ? current.episode.title : current.station.name;
    const artist = current.kind === 'episode' ? showDisplayTitle(current.show) : current.station.group || '留频电台';
    const image = current.kind === 'episode' ? proxiedImage(current.show.image) : undefined;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: '留频',
      artwork: [
        {
          src: image
            ? new URL(image, window.location.origin).toString()
            : new URL(assetUrl('icon.svg'), window.location.origin).toString(),
          sizes: '512x512',
          type: 'image/svg+xml',
        },
      ],
    });
    navigator.mediaSession.playbackState = playback.isPlaying ? 'playing' : 'paused';
    return () => {
      // Handlers are replaced on the next effect run; nothing to clear here.
    };
  }, [current, playback.isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => setPlayback((snapshot) => ({ ...snapshot, isPlaying: true }))],
      ['pause', () => pause()],
      ['seekbackward', (details) => skip(-(details.seekOffset || 15))],
      ['seekforward', (details) => skip(details.seekOffset || 30)],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') seek(details.seekTime);
        },
      ],
      ['nexttrack', next],
      ['previoustrack', previous],
    ];
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Older browsers reject unsupported actions.
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // noop
        }
      }
    };
  }, [next, pause, previous, seek, skip]);

  useEffect(() => {
    document.title = current
      ? `${current.kind === 'episode' ? current.episode.title : current.station.name} · 留频`
      : '留频 · 播客与电台调谐器';
  }, [current]);

  // Flush the current position synchronously when the page is being hidden so
  // reopening the app restores exactly where the listener left off.
  useEffect(() => {
    const flush = () => {
      const target = currentRef.current;
      const audio = audioEl.current;
      if (!target || target.kind !== 'episode' || !audio || !Number.isFinite(audio.currentTime)) return;
      const state = dataRef.current;
      const positions = { ...state.positions, [target.key]: audio.currentTime };
      savePositions(positions);
      savePersistedState({ ...state, positions });
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // Mirror the current item into Android's media session (system panel,
  // HyperOS focus/island) and the home screen widget.
  // The system extrapolates progress from PlaybackState, but the notification
  // card only redraws on an update. A slow re-sync keeps it honest without the
  // per-5s wakeups the old build did (the service skips rebuilding the
  // notification when nothing visible changed).
  useEffect(() => {
    if (!isNativePlatform() || !current || !playback.isPlaying) return;
    let timer = 0;
    const schedule = () => {
      const delay = document.hidden ? 60_000 : 15_000;
      timer = window.setTimeout(() => {
        publishMediaState();
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [current, playback.isPlaying, publishMediaState]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    if (!current) {
      clearMediaState();
      return;
    }
    publishMediaState();
    return undefined;
  }, [current, playback.isPlaying, publishMediaState]);

  useEffect(() => {
    if (!isNativePlatform()) return undefined;
    const run = (action: string) => {
      if (action === 'play') {
        setPlayback((snapshot) => (snapshot.isPlaying ? snapshot : { ...snapshot, isPlaying: true }));
      } else if (action === 'pause') {
        audioEl.current?.pause();
        setPlayback((snapshot) => ({ ...snapshot, isPlaying: false }));
      } else if (action === 'next') {
        nextRef.current?.();
      } else if (action === 'prev') {
        previousRef.current?.();
      } else if (action.startsWith('seek:')) {
        const seconds = Number(action.slice(5));
        if (Number.isFinite(seconds)) seekRef.current?.(seconds);
      }
    };
    const off = onMediaAction(run);
    void takePendingMediaAction().then((action) => {
      if (action) run(action);
    });
    return off;
  }, []);

  nextRef.current = next;
  previousRef.current = previous;
  seekRef.current = seek;

  const value = useMemo<AppStoreValue>(
    () => ({
      shows: data.shows,
      stations: data.stations,
      queue: data.queue,
      positions: data.positions,
      current,
      currentKey,
      favorites: data.favorites,
      prefs: data.preferences,
      hapticsAvailable,
      playback,
      sleep,
      sleepRemaining,
      currentChapterIndex,
      currentTranscriptIndex,
      currentExtraStatus,
      spectrumReady,
      spectrumBlocked,
      readSpectrum,
      toasts,
      playRef,
      playEpisode,
      playStation,
      playStationAndAdd,
      togglePlay,
      pause,
      seek,
      skip,
      next,
      previous,
      setVolume,
      toggleMute,
      setRate,
      toggleFavorite,
      isFavorite,
      setTheme,
      setMode,
      setFollowTranscript,
      setHaptics,
      setSleepMinutes,
      setSleepAtEpisodeEnd,
      retryCurrentExtras,
      exportBackup,
      importBackup,
      addShow,
      renameShow,
      removeShow,
      addStations,
      renameStationPlaylist,
      renameStation,
      setStationCover,
      removeStation,
      addToQueue,
      removeFromQueue,
      clearQueue,
      moveQueueItem,
      isQueued,
      notify,
      dismissToast,
    }),
    [
      data.shows,
      data.stations,
      data.queue,
      data.positions,
      data.favorites,
      data.preferences,
      current,
      currentKey,
      playback,
      sleep,
      sleepRemaining,
      currentChapterIndex,
      currentTranscriptIndex,
      currentExtraStatus,
      spectrumReady,
      spectrumBlocked,
      readSpectrum,
      toasts,
      playRef,
      playEpisode,
      playStation,
      playStationAndAdd,
      togglePlay,
      pause,
      seek,
      skip,
      next,
      setVolume,
      toggleMute,
      setRate,
      toggleFavorite,
      isFavorite,
      setTheme,
      setMode,
      setFollowTranscript,
      setSleepMinutes,
      setSleepAtEpisodeEnd,
      retryCurrentExtras,
      exportBackup,
      importBackup,
      addShow,
      renameShow,
      removeShow,
      addStations,
      renameStationPlaylist,
      renameStation,
      setStationCover,
      removeStation,
      addToQueue,
      removeFromQueue,
      clearQueue,
      moveQueueItem,
      isQueued,
      notify,
      dismissToast,
    ],
  );

  return (
    <AppStoreContext.Provider value={value}>
      <audio
        ref={audioEl}
        preload="metadata"
        playsInline
        onPlay={() => {
          const context = audioContextRef.current;
          if (context?.state === 'suspended') void context.resume().catch(() => undefined);
        }}
        onLoadedMetadata={() => {
          const audio = audioEl.current;
          const target = currentRef.current;
          if (!audio || !target) return;
          const mediaDuration = audio.duration;
          const usableDuration =
            target.kind === 'episode' && Number.isFinite(mediaDuration) && mediaDuration > 0
              ? mediaDuration
              : playbackRef.current.duration;
          const seekTo = pendingSeekRef.current;
          pendingSeekRef.current = null;
          if (target.kind === 'episode' && seekTo != null && seekTo > 0) {
            const safe = Math.min(seekTo, Math.max(0, usableDuration - 1));
            try {
              audio.currentTime = safe;
            } catch {
              // Some live streams do not support seeking.
            }
          }
          setPlayback((snapshot) => ({
            ...snapshot,
            isLoading: false,
            duration: usableDuration,
            currentTime: audio.currentTime || snapshot.currentTime,
          }));
          if (playbackRef.current.isPlaying) requestPlay();
        }}
        onDurationChange={() => {
          const audio = audioEl.current;
          const target = currentRef.current;
          if (!audio || target?.kind !== 'episode') return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setPlayback((snapshot) => ({ ...snapshot, duration: audio.duration }));
          }
        }}
        onTimeUpdate={() => {
          const audio = audioEl.current;
          const target = currentRef.current;
          if (!audio || !target) return;
          if (target.kind === 'radio') return;
          const time = audio.currentTime;

          // Browsers fire timeupdate ~4x/second. Re-rendering the whole tree that
          // often keeps the CPU busy during background playback, so the visible
          // clock updates once a second and only while the UI is on screen.
          const now = performance.now();
          const interval = document.hidden ? 2000 : 900;
          if (now - lastTickAtRef.current >= interval) {
            lastTickAtRef.current = now;
            if (!document.hidden) {
              setPlayback((snapshot) =>
                Math.abs(snapshot.currentTime - time) < 0.05 ? snapshot : { ...snapshot, currentTime: time },
              );
            }
          }
          if (Math.abs(time - lastSavedPositionRef.current) > 30) {
            lastSavedPositionRef.current = time;
            setData((state) => ({
              ...state,
              positions: { ...state.positions, [target.key]: time },
            }));
          }
        }}
        onProgress={() => {
          const audio = audioEl.current;
          if (!audio || !audio.duration || !Number.isFinite(audio.duration) || !audio.buffered.length) return;
          const end = audio.buffered.end(audio.buffered.length - 1);
          setPlayback((snapshot) => ({ ...snapshot, buffered: (end / audio.duration) * 100 }));
        }}
        onWaiting={() => {
          if (playbackRef.current.isPlaying) {
            setPlayback((snapshot) => ({ ...snapshot, isLoading: true }));
          }
        }}
        onCanPlay={() => setPlayback((snapshot) => ({ ...snapshot, isLoading: false }))}
        onPlaying={() => setPlayback((snapshot) => ({ ...snapshot, isLoading: false, error: null }))}
        onEnded={() => {
          const target = currentRef.current;
          if (!target || target.kind !== 'episode') return;
          const mediaDuration = audioEl.current?.duration;
          const finishedAt =
            Number.isFinite(mediaDuration) && (mediaDuration ?? 0) > 0
              ? (mediaDuration as number)
              : playbackRef.current.duration || target.episode.duration;
          if (finishedAt > 0) {
            setData((state) => ({
              ...state,
              positions: { ...state.positions, [target.key]: finishedAt },
            }));
          }
          setPlayback((snapshot) => ({ ...snapshot, currentTime: snapshot.duration }));
          if (sleep?.mode === 'end') {
            setSleep(null);
            setPlayback((snapshot) => ({ ...snapshot, isPlaying: false }));
            notify('节目结束，定时任务已完成。');
            return;
          }
          const state = dataRef.current;
          const index = state.queue.findIndex((entry) => entry.key === target.key);
          const nextEntry = index >= 0 ? state.queue[index + 1] : state.queue[0];
          if (nextEntry) {
            playRef(nextEntry.ref);
          } else {
            setPlayback((snapshot) => ({ ...snapshot, isPlaying: false }));
          }
        }}
        onError={() => {
          const target = currentRef.current;
          const audio = audioEl.current;
          if (!target) return;
          // A CORS-enabled media request can fail even though the stream itself
          // is fine. Retry once without it so playback still works; the analyser
          // then stays silent and the spectrum uses its fallback animation.
          if (audio && !STATIC_DEMO && corsFallbackRef.current !== target.key && audio.getAttribute('crossorigin')) {
            corsFallbackRef.current = target.key;
            setSpectrumBlocked(true);
            audio.removeAttribute('crossorigin');
            const retryUrl = target.kind === 'episode' ? target.episode.audioUrl : target.station.url;
            audio.src = audioSource(retryUrl);
            audio.load();
            if (playbackRef.current.isPlaying) requestPlay();
            return;
          }
          setPlayback((snapshot) => ({
            ...snapshot,
            isLoading: false,
            isPlaying: false,
            error: '音频无法播放',
          }));
          notify('音频无法播放，请检查网络或换一段内容。', 'error');
        }}
      />
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return value;
}
