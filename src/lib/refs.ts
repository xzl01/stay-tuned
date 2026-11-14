/* SPDX-License-Identifier: GPL-3.0-only */

import type { Playable, PlayableRef, Show, Station } from '../types';

export function refKey(ref: PlayableRef): string {
  return ref.kind === 'episode'
    ? `episode:${ref.showId}:${ref.episodeId}`
    : `radio:${ref.stationId}`;
}

export function refFromKey(key: string): PlayableRef | null {
  const [kind, a, b] = key.split(':');
  if (kind === 'episode' && a && b) return { kind: 'episode', showId: a, episodeId: b };
  if (kind === 'radio' && a) return { kind: 'radio', stationId: a };
  return null;
}

export function resolvePlayable(
  ref: PlayableRef | null,
  shows: Show[],
  stations: Station[],
): Playable | null {
  if (!ref) return null;
  if (ref.kind === 'episode') {
    const show = shows.find((item) => item.id === ref.showId);
    const episode = show?.episodes.find((item) => item.id === ref.episodeId);
    if (!show || !episode) return null;
    return {
      kind: 'episode',
      ref,
      key: refKey(ref),
      show,
      episode,
    };
  }
  const station = stations.find((item) => item.id === ref.stationId);
  if (!station) return null;
  return { kind: 'radio', ref, key: refKey(ref), station };
}

export function findPlayableByKey(
  key: string,
  shows: Show[],
  stations: Station[],
): Playable | null {
  return resolvePlayable(refFromKey(key), shows, stations);
}

export function episodeRef(showId: string, episodeId: string): PlayableRef {
  return { kind: 'episode', showId, episodeId };
}

export function stationRef(stationId: string): PlayableRef {
  return { kind: 'radio', stationId };
}
