/* SPDX-License-Identifier: GPL-3.0-only */

import { flushSync } from 'react-dom';

/**
 * 「一镜到底」转场。
 *
 * 参考金标联盟 SharedViewKit 的语义，把同一套规则搬到了 Web 层：
 *
 * - 运行时能力探测，不支持（或使用者要求减少动效）时退回普通切换，
 *   对应 `ViewAnimationManager.isViewAnimationSupported() == 0` 时的回退；
 * - 源元素与目标元素共用一个 view-transition-name，位置和尺寸由浏览器插值，
 *   对应 `makeViewAnimationOptions(view, ...)`；
 * - 取消用 `skipTransition()`，对应 `cancelCurrentViewAnimation()`。
 *
 * 与 kit 的一个差别：圆角不靠传参，浏览器直接拿两个元素的实测盒模型插值，
 * 所以不存在「传 dp 被当 px」那种圆角跳闪。
 */

type TransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
};

type DocumentWithTransitions = Document & {
  startViewTransition?: (callback: () => void) => TransitionLike;
};

let activeTransition: TransitionLike | null = null;

/** 当前环境能否跑一镜到底；减少动效时直接视为不支持。 */
export function sharedTransitionsSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return false;
  return typeof (document as DocumentWithTransitions).startViewTransition === 'function';
}

/** 给元素挂/摘转场名。源与目标共用同一个名字。 */
export function setTransitionName(element: Element | null, name: string | null): void {
  if (!(element instanceof HTMLElement)) return;
  if (name) element.style.setProperty('view-transition-name', name);
  else element.style.removeProperty('view-transition-name');
}

/**
 * 跑一次带转场的状态更新。
 *
 * `update` 里必须是同步提交的 DOM 变更（React 状态更新会被 flushSync 强制提交），
 * 否则浏览器拍不到「新状态」的第一帧。
 */
export function runSharedTransition(update: () => void): void {
  if (!sharedTransitionsSupported()) {
    update();
    return;
  }
  cancelSharedTransition();
  const transition = (document as DocumentWithTransitions).startViewTransition!(() => {
    flushSync(update);
  });
  activeTransition = transition;
  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (activeTransition === transition) activeTransition = null;
    });
}

/** 强制结束当前转场并复位，对应 kit 的 cancelCurrentViewAnimation()。 */
export function cancelSharedTransition(): void {
  if (!activeTransition) return;
  try {
    activeTransition.skipTransition();
  } catch {
    // 过渡已经结束时 skip 会抛；忽略即可。
  }
  activeTransition = null;
}
