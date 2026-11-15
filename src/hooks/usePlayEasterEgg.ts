/* SPDX-License-Identifier: GPL-3.0-only */

import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { useAppStore } from '../state/AppStore';
import { pulse } from '../lib/haptics';

export const Receiver3DEggContext = createContext<{ active: boolean; open: () => void; close: () => void } | null>(null);

/** A normal click stays a click. Only an uninterrupted five-second hold opens
 * the egg; its eventual click must never also toggle audio playback. */
export function usePlayEasterEgg(onPress: () => void) {
  const egg = useContext(Receiver3DEggContext);
  const open = egg?.open;
  const { prefs } = useAppStore();
  const enabled = prefs.mode === 'skeuo' && Boolean(open) && !egg?.active;
  const latest = useRef({ enabled, open, onPress });
  latest.current = { enabled, open, onPress };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);
  const active = useRef<{ pointerId?: number; element?: HTMLButtonElement; key?: string } | null>(null);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);

  function clear() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (holdTimer.current !== null) clearInterval(holdTimer.current);
    holdTimer.current = null;
    const gesture = active.current;
    active.current = null;
    if (gesture?.pointerId != null && gesture.element?.hasPointerCapture(gesture.pointerId)) {
      gesture.element.releasePointerCapture(gesture.pointerId);
    }
    setHolding(false);
  }
  function cancel() {
    if (active.current) suppressClick.current = true;
    clear();
  }
  function outsideButton(event: { clientX: number; clientY: number; pointerType: string }, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const padding = event.pointerType === 'touch' ? 18 : 8;
    return event.clientX < rect.left - padding || event.clientX > rect.right + padding
      || event.clientY < rect.top - padding || event.clientY > rect.bottom + padding;
  }
  function start(gesture: NonNullable<typeof active.current>) {
    clear();
    suppressClick.current = false;
    active.current = gesture;
    setHolding(true);
    holdStart.current = Date.now();
    // Escalating ticks while the key is held: the motor says "keep going".
    holdTimer.current = window.setInterval(() => {
      if (!active.current) return;
      const progress = Math.min(1, (Date.now() - holdStart.current) / 5000);
      pulse('holdTick', { amplitude: 70 + Math.round(150 * progress) });
    }, 700);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!active.current || !latest.current.enabled || document.hidden) return;
      suppressClick.current = true;
      setHolding(false);
      pulse('powerOn');
      latest.current.open?.();
    }, 5000);
  }

  useEffect(() => {
    if (!enabled) cancel();
    else if (!active.current) suppressClick.current = false;
  }, [enabled]);
  useEffect(() => {
    // Window-level release also catches mouse-up outside the button.
    const release = (event: PointerEvent) => {
      if (active.current?.pointerId === event.pointerId) clear();
    };
    const hide = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hide);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (holdTimer.current !== null) clearInterval(holdTimer.current);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  const bindings: ButtonHTMLAttributes<HTMLButtonElement> & { 'data-egg-holding'?: string } = {
    'data-egg-holding': holding ? 'true' : undefined,
    onPointerDown(event) {
      suppressClick.current = false;
      if (!latest.current.enabled || event.button !== 0 || !event.isPrimary) return;
      start({ pointerId: event.pointerId, element: event.currentTarget });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      const gesture = active.current;
      if (gesture?.pointerId !== event.pointerId) return;
      if (gesture.element && outsideButton(event, gesture.element)) cancel();
    },
    onPointerLeave(event) {
      const gesture = active.current;
      if (gesture?.pointerId === event.pointerId && gesture.element
          && !gesture.element.hasPointerCapture(event.pointerId) && outsideButton(event, gesture.element)) cancel();
    },
    onPointerCancel: cancel,
    onLostPointerCapture(event) { if (active.current?.pointerId === event.pointerId) cancel(); },
    onPointerUp() { clear(); },
    // Pointer gestures follow capture, not keyboard focus. The embedded browser
    // may move focus while the mouse is still held over the same button.
    onBlur() { if (active.current?.key) cancel(); },
    onContextMenu(event) { if (active.current) event.preventDefault(); },
    onKeyDown(event) {
      if (!latest.current.enabled) {
        if (!active.current) suppressClick.current = false;
        return;
      }
      if (![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat && !active.current) start({ key: event.key });
    },
    onKeyUp(event) {
      if (!latest.current.enabled || ![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      if (active.current?.key !== event.key) return;
      const shouldPlay = !suppressClick.current;
      clear();
      if (shouldPlay) {
        pulse('lever');
        latest.current.onPress();
      }
    },
    onClick(event) {
      if (suppressClick.current) {
        event.preventDefault();
        suppressClick.current = false;
        return;
      }
      const native = event.nativeEvent as PointerEvent;
      pulse('lever', { pointerType: typeof native.pointerType === 'string' ? native.pointerType : undefined });
      latest.current.onPress();
    },
  };
  return bindings;
}
