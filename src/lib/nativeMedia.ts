/* SPDX-License-Identifier: GPL-3.0-only */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeLoadOptions {
  url: string;
  title: string;
  subtitle: string;
  artwork: string;
  position: number;
  rate: number;
  volume: number;
  live: boolean;
  playing: boolean;
  /** Current chapter label for OEM rear-screen media artwork. */
  chapter?: string;
  /** Stable episode identity, used for native progress persistence. */
  key?: string;
}

export interface NativeBackScreenSupport {
  available: boolean;
  reason?: string;
}

export interface NativeDisplayOptions {
  chapter: string;
  volume: number;
  mode: string;
  theme: string;
  /** Draw the playing state on the StepOS dot-matrix back screen. */
  backScreen: boolean;
}

export interface NativePlaybackState {
  isPlaying: boolean;
  position: number;
  duration: number;
  buffered: number;
  state: string;
}

interface MediaBridgePlugin {
  load(options: NativeLoadOptions): Promise<{ ok: boolean }>;
  updateDisplay(options: NativeDisplayOptions): Promise<void>;
  backScreenSupport(): Promise<NativeBackScreenSupport>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(options: { position: number }): Promise<void>;
  setRate(options: { rate: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  stop(): Promise<void>;
  consumePendingAction(): Promise<{ action?: string }>;
  addListener(
    eventName: 'mediaAction' | 'nativeState' | 'ended' | 'nativeError',
    listener: (event: Record<string, unknown>) => void,
  ): Promise<PluginListenerHandle>;
}

const MediaBridge = registerPlugin<MediaBridgePlugin>('MediaBridge');

export const nativePlaybackAvailable = (): boolean => Capacitor.getPlatform() !== 'web';

function absoluteArtwork(url: string): string {
  if (!url) return '';
  if (/^https?:/i.test(url)) return url;
  if (url.startsWith('/')) {
    try {
      return new URL(url, window.location.origin).toString();
    } catch {
      return '';
    }
  }
  return '';
}

function quietly(run: () => Promise<unknown>): void {
  if (!nativePlaybackAvailable()) return;
  void run().catch(() => undefined);
}

export function nativeLoad(options: NativeLoadOptions): void {
  quietly(() => MediaBridge.load({ ...options, artwork: absoluteArtwork(options.artwork) }));
}

export function nativeUpdateDisplay(options: NativeDisplayOptions): void {
  quietly(() => MediaBridge.updateDisplay(options));
}

/** Whether this device has the StepOS dot-matrix back screen. */
export async function nativeBackScreenSupport(): Promise<NativeBackScreenSupport> {
  try {
    return await MediaBridge.backScreenSupport();
  } catch {
    return { available: false };
  }
}

export const nativePlay = (): void => quietly(() => MediaBridge.play());
export const nativePause = (): void => quietly(() => MediaBridge.pause());
export const nativeStop = (): void => quietly(() => MediaBridge.stop());
export const nativeSeekTo = (position: number): void => quietly(() => MediaBridge.seekTo({ position }));
export const nativeSetRate = (rate: number): void => quietly(() => MediaBridge.setRate({ rate }));
export const nativeSetVolume = (volume: number): void => quietly(() => MediaBridge.setVolume({ volume }));

function subscribe(
  event: 'mediaAction' | 'nativeState' | 'ended' | 'nativeError',
  handler: (data: Record<string, unknown>) => void,
): () => void {
  if (!nativePlaybackAvailable()) return () => undefined;
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  void MediaBridge.addListener(event, handler)
    .then((created) => {
      if (cancelled) void created.remove();
      else handle = created;
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    void handle?.remove();
  };
}

export const onNativeState = (handler: (state: NativePlaybackState) => void): (() => void) =>
  subscribe('nativeState', (data) => handler(data as unknown as NativePlaybackState));

export const onNativeEnded = (handler: () => void): (() => void) =>
  subscribe('ended', () => handler());

export const onNativeError = (handler: (message: string) => void): (() => void) =>
  subscribe('nativeError', (data) => handler(String(data.message ?? '')));

export const onMediaAction = (handler: (action: string) => void): (() => void) =>
  subscribe('mediaAction', (data) => handler(String(data.action ?? '')));

/** Widget / notification taps that launched the app before JS was ready. */
export async function takePendingMediaAction(): Promise<string | null> {
  if (!nativePlaybackAvailable()) return null;
  try {
    const result = await MediaBridge.consumePendingAction();
    return result.action ?? null;
  } catch {
    return null;
  }
}
