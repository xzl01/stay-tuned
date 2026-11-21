/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * HarmonyOS media session bridge.
 *
 * The ArkTS side owns the long-running background task and the AVSession, but
 * the audio itself still plays in this page. So the page reports what it is
 * playing, and the session sends transport commands back through
 * `window.__stayTunedMediaCommand`.
 */

interface HarmonyMediaBridge {
  update(stateJson: string): void;
}

declare global {
  interface Window {
    StayTunedMedia?: HarmonyMediaBridge;
    __stayTunedMediaCommand?: (command: string, value?: number) => void;
  }
}

export interface HarmonyMediaState {
  title: string;
  artist: string;
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  /** Remote cover URL or an inline `data:` image; empty when there is none. */
  artwork?: string;
}

export type HarmonyMediaCommand = 'play' | 'pause' | 'next' | 'prev' | 'seek';

/** Position updates arrive ~1/s; the session only needs a coarse picture. */
const PUSH_INTERVAL_MS = 1000;

let lastPushAt = 0;
let lastSignature = '';

/**
 * Only sources the ArkTS side can actually read: a remote URL or an inline
 * data URL. Generated SVG covers have neither, so the session simply shows no
 * artwork rather than failing.
 */
export function remoteArtwork(url: string | undefined): string {
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return '';
}

export function isHarmonyMediaAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.StayTunedMedia?.update === 'function';
}

function signature(state: HarmonyMediaState): string {
  // Everything except the position: those changes must go out immediately.
  return `${state.title}|${state.artist}|${state.playing ? 1 : 0}|${Math.round(state.duration)}|${state.speed}|${state.artwork ?? ''}`;
}

export function pushHarmonyMedia(state: HarmonyMediaState): void {
  const bridge = typeof window === 'undefined' ? undefined : window.StayTunedMedia;
  if (!bridge) return;

  const now = Date.now();
  const key = signature(state);
  const mustSend = key !== lastSignature || now - lastPushAt >= PUSH_INTERVAL_MS;
  if (!mustSend) return;

  lastPushAt = now;
  lastSignature = key;
  try {
    bridge.update(
      JSON.stringify({
        title: state.title,
        artist: state.artist,
        playing: state.playing,
        position: Number.isFinite(state.position) ? state.position : 0,
        duration: Number.isFinite(state.duration) ? state.duration : 0,
        speed: Number.isFinite(state.speed) ? state.speed : 1,
        artwork: state.artwork ?? '',
      }),
    );
  } catch {
    // A missing session must never break playback.
  }
}

export function onHarmonyMediaCommand(
  handler: (command: HarmonyMediaCommand, value?: number) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.__stayTunedMediaCommand = (command, value) => handler(command as HarmonyMediaCommand, value);
  return () => {
    if (window.__stayTunedMediaCommand) delete window.__stayTunedMediaCommand;
  };
}
