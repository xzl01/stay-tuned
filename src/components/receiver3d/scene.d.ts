/* SPDX-License-Identifier: GPL-3.0-only */

import type { Chapter, Theme } from '../../types';

export type ReceiverView = 'front' | 'three-quarter' | 'back';
export interface ReceiverSceneState {
  sourceKey: string;
  theme: Theme;
  chapter: number;
  chapters: Chapter[];
  canTune: boolean;
  volume: number;
  playing: boolean;
  loading: boolean;
  time: string;
  line: string;
}
export interface ReceiverSceneCallbacks {
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onChapter: (index: number) => void;
  onVolume: (value: number) => void;
  onOpenQueue: () => void;
  onViewChange: (view: ReceiverView | null) => void;
  onOrbitChange: (active: boolean) => void;
  onError: () => void;
}
export interface ReceiverScene {
  update: (state: ReceiverSceneState) => void;
  setView: (view: ReceiverView) => void;
  setOrbit: (active: boolean) => void;
  dispose: () => void;
}
export function createReceiverScene(host: HTMLElement, initial: ReceiverSceneState, callbacks: ReceiverSceneCallbacks): ReceiverScene;
