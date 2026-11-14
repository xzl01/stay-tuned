/* SPDX-License-Identifier: GPL-3.0-only */

import { Component, lazy, Suspense, type ReactNode } from 'react';

// Declaring this does not request the module. No model, Three.js, or 3D styles
// are fetched until the five-second gesture actually replaces the receiver.
const Receiver3DView = lazy(() => import('./receiver3d/Receiver3DView'));

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p className="receiver-3d-message" role="alert">模型暂时无法载入，请返回原外观后刷新重试。播放不受影响。</p>
      : this.props.children;
  }
}

export function Receiver3DEasterEgg({ variant, onClose, onOpenQueue }: { variant: 'desktop' | 'mobile'; onClose: () => void; onOpenQueue: () => void }) {
  return (
    <div className={`receiver-3d-slot receiver-3d-slot--${variant}`}>
      <ModelErrorBoundary>
        <Suspense fallback={<p className="receiver-3d-message" role="status">正在打开收音机的另一面…</p>}>
          <Receiver3DView onClose={onClose} onOpenQueue={onOpenQueue} />
        </Suspense>
      </ModelErrorBoundary>
      <button type="button" className="receiver-3d-exit" onClick={onClose} title="返回原拟物收音机" aria-label="退出三维收音机">退出 3D</button>
    </div>
  );
}
