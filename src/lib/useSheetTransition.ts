/* SPDX-License-Identifier: GPL-3.0-only */

import { useCallback, useRef } from 'react';
import { runSharedTransition, setTransitionName } from './viewTransition';

/**
 * 把「源卡片 → 浮层」串成一次一镜到底。
 *
 * 打开：旧状态给源卡片命名，新状态把名字交给浮层，于是卡片放大成面板；
 * 关闭：旧状态是面板，新状态把名字还给卡片，面板缩回原位。
 * 不支持转场时两者都退化成普通的状态切换。
 */
export function useSheetTransition(name: string) {
  const sourceRef = useRef<HTMLElement | null>(null);

  const bindSource = useCallback((element: HTMLElement | null) => {
    sourceRef.current = element;
  }, []);

  const begin = useCallback(
    (apply: () => void) => {
      const source = sourceRef.current;
      if (!source) {
        apply();
        return;
      }
      setTransitionName(source, name);
      runSharedTransition(() => {
        setTransitionName(source, null);
        apply();
      });
    },
    [name],
  );

  const end = useCallback(
    (apply: () => void) => {
      const source = sourceRef.current;
      runSharedTransition(() => {
        setTransitionName(source, name);
        apply();
      });
      // 转场结束后摘掉名字，避免残留在后续无关的切换里。
      window.setTimeout(() => setTransitionName(source, null), 420);
    },
    [name],
  );

  return { bindSource, begin, end };
}
