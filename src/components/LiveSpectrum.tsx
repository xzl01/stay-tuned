/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/AppStore';
import { isNativePlatform } from '../lib/serverConfig';

type SpectrumMode = 'scope' | 'mobile' | 'rail';

interface LiveSpectrumProps {
  bars: number;
  active: boolean;
  className: string;
  mode?: SpectrumMode;
}

const RANGES: Record<SpectrumMode, { min: number; max: number; floor: number }> = {
  scope: { min: 5, max: 54, floor: 4 },
  mobile: { min: 3, max: 24, floor: 2 },
  rail: { min: 2, max: 11, floor: 2 },
};

function fallbackHeight(mode: SpectrumMode, index: number): number {
  if (mode === 'scope') return 12 + Math.abs(Math.sin(index * 0.63 + 1.2)) * 42;
  if (mode === 'mobile') return 5 + Math.abs(Math.sin(index * 0.7)) * 18;
  return 2 + Math.abs(Math.sin(index * 0.9)) * 4;
}

/**
 * Log-spaced spectrum bars driven by the real audio analyser. Heights are
 * written directly to the DOM so 60fps audio animation never re-renders React.
 */
export function LiveSpectrum({ bars, active, className, mode = 'scope' }: LiveSpectrumProps) {
  const { spectrumReady, spectrumBlocked, readSpectrum } = useAppStore();
  const containerRef = useRef<HTMLSpanElement>(null);
  const barRefs = useRef<(HTMLElement | null)[]>([]);
  const levelsRef = useRef<number[]>(Array.from({ length: bars }, () => 0));

  useEffect(() => {
    const container = containerRef.current;
    const elements = barRefs.current.slice(0, bars);
    if (!container || !elements.length) return;

    const range = RANGES[mode];
    const setFloor = () => {
      elements.forEach((element) => {
        if (!element) return;
        element.style.height = `${range.floor}px`;
      });
    };

    if (!spectrumReady || spectrumBlocked) {
      container.classList.remove('has-spectrum');
      elements.forEach((element, index) => {
        if (!element) return;
        element.style.height = `${fallbackHeight(mode, index)}px`;
      });
      return;
    }

    container.classList.add('has-spectrum');
    if (!active) {
      levelsRef.current = Array.from({ length: bars }, () => 0);
      setFloor();
      return;
    }

    const data = new Uint8Array(256);
    const levels = levelsRef.current.length === bars
      ? levelsRef.current
      : Array.from({ length: bars }, () => 0);
    levelsRef.current = levels;
    const MIN_HZ = 45;
    const MAX_HZ = 14000;
    const NYQUIST = 22050;
    // A tainted (cross-origin, no CORS) stream yields exact zeros. After a few
    // seconds of that we stop pretending and hand back to the CSS animation.
    const SILENT_FRAME_LIMIT = 150;
    let silentFrames = 0;
    const showFallback = () => {
      container.classList.remove('has-spectrum');
      elements.forEach((element, index) => {
        if (!element) return;
        element.style.height = `${fallbackHeight(mode, index)}px`;
      });
    };
    let frame = 0;

    // 安卓的频段来自原生音频管线：安静或缓冲时读到 0 是正常的，
    // 不能像跨域 Web Audio 那样判死刑并永久退回装饰柱。
    const nativeSpectrum = isNativePlatform();

    const tick = () => {
      if (!readSpectrum(data)) {
        setFloor();
        frame = window.requestAnimationFrame(tick);
        return;
      }
      let rawPeak = 0;
      for (let index = 0; index < data.length; index += 1) {
        if (data[index] > rawPeak) rawPeak = data[index];
      }
      if (rawPeak === 0) {
        silentFrames += 1;
        if (silentFrames > SILENT_FRAME_LIMIT) {
          if (!nativeSpectrum) {
            showFallback();
            return;
          }
          // 原生：先归零，但继续轮询，有声音就恢复。
          setFloor();
          container.classList.add('has-spectrum');
        }
      } else {
        silentFrames = 0;
        if (nativeSpectrum) container.classList.add('has-spectrum');
      }

      const targets: number[] = [];
      for (let index = 0; index < bars; index += 1) {
        const position = (index + 0.5) / bars;
        const freq = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, position);
        const bin = (freq / NYQUIST) * data.length;
        const low = Math.max(0, Math.min(data.length - 1, Math.floor(bin)));
        const high = Math.min(data.length - 1, low + 1);
        const mix = bin - Math.floor(bin);
        const value = data[low] * (1 - mix) + data[high] * mix;
        const tilt = 0.72 + position * 1.15;
        targets.push(Math.pow(value / 255, 1.55) * tilt);
      }

      const peak = Math.max(...targets);
      const targetPeak = mode === 'scope' ? 0.92 : mode === 'mobile' ? 0.95 : 0.86;
      const maxGain = 12;
      const gain = peak > 0.02 ? Math.min(maxGain, targetPeak / peak) : 1;
      for (let index = 0; index < bars; index += 1) {
        const target = Math.min(1, targets[index] * gain);
        const previous = levels[index] ?? 0;
        const next = target > previous ? previous + (target - previous) * 0.62 : previous + (target - previous) * 0.2;
        levels[index] = next;
        const element = elements[index];
        if (element) {
          const height = range.min + next * (range.max - range.min);
          element.style.height = `${height.toFixed(1)}px`;
        }
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [active, bars, mode, readSpectrum, spectrumBlocked, spectrumReady]);

  return (
    <span ref={containerRef} className={className} aria-hidden="true">
      {Array.from({ length: bars }).map((_, index) => (
        <i
          key={index}
          ref={(element) => {
            barRefs.current[index] = element;
          }}
        />
      ))}
    </span>
  );
}
