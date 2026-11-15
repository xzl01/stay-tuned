/* SPDX-License-Identifier: GPL-3.0-only */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface MediaStatePayload {
  title: string;
  subtitle: string;
  isPlaying: boolean;
  position: number;
  duration: number;
  isLive: boolean;
  /** Cover image URL for the media session / dynamic island. */
  artwork: string;
}

interface MediaBridgePlugin {
  updateState(options: MediaStatePayload): Promise<{ ok: boolean }>;
  clear(): Promise<void>;
  consumePendingAction(): Promise<{ action?: string }>;
  addListener(
    eventName: 'mediaAction',
    listener: (event: { action: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const MediaBridge = registerPlugin<MediaBridgePlugin>('MediaBridge');

export const nativeMediaAvailable = (): boolean => Capacitor.getPlatform() !== 'web';

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

/** Push the current item to the Android media session and home screen widget. */
export function pushMediaState(payload: MediaStatePayload): void {
  if (!nativeMediaAvailable()) return;
  void MediaBridge.updateState({ ...payload, artwork: absoluteArtwork(payload.artwork) }).catch(
    () => undefined,
  );
}

export function clearMediaState(): void {
  if (!nativeMediaAvailable()) return;
  void MediaBridge.clear().catch(() => undefined);
}

export function onMediaAction(handler: (action: string) => void): () => void {
  if (!nativeMediaAvailable()) return () => undefined;
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  void MediaBridge.addListener('mediaAction', (event) => handler(event.action))
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

/** Widget / notification taps that launched the app before JS was ready. */
export async function takePendingMediaAction(): Promise<string | null> {
  if (!nativeMediaAvailable()) return null;
  try {
    const result = await MediaBridge.consumePendingAction();
    return result.action ?? null;
  } catch {
    return null;
  }
}
