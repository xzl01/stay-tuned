/* SPDX-License-Identifier: GPL-3.0-only */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon, type IconName } from '../Icon';
import { clamp } from '../../lib/format';

export interface FaderProps {
  label: string;
  icon?: IconName;
  value: number;
  min?: number;
  max: number;
  step?: number;
  disabled?: boolean;
  ticks?: number;
  variant: 'chapter' | 'volume';
  ariaLabel: string;
  valueText: string;
  /** Called continuously, immediately, when no onCommit is supplied. */
  onChange?: (value: number) => void;
  /** Called once when a drag / keyboard adjustment ends. */
  onCommit?: (value: number) => void;
  /** Reports the temporary value while scrubbing, or null when done. */
  onPreview?: (value: number | null) => void;
}

export function Fader({
  label,
  icon,
  value,
  min = 0,
  max,
  step = 1,
  disabled = false,
  ticks = 11,
  variant,
  ariaLabel,
  valueText,
  onChange,
  onCommit,
  onPreview,
}: FaderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const displayValue = draft ?? value;
  const span = Math.max(1, max - min);
  const position = clamp((displayValue - min) / span, 0, 1) * 100;

  const commit = useCallback(() => {
    if (draftRef.current == null) return;
    const next = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    onCommit?.(next);
    onPreview?.(null);
  }, [onCommit, onPreview]);

  useEffect(() => {
    if (draft == null) return;
    const finish = () => commit();
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('touchend', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('touchend', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [draft, commit]);

  const handleChange = (next: number) => {
    if (onCommit) {
      draftRef.current = next;
      setDraft(next);
      onPreview?.(next);
    } else {
      onChange?.(next);
    }
  };

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      commit();
    }
  };

  return (
    <div
      className={`fader fader--${variant} ${disabled ? 'is-disabled' : ''}`}
      style={{ '--fader-position': `${position}%` } as CSSProperties}
    >
      <span className="fader-label">
        {icon ? <Icon name={icon} size={15} strokeWidth={1.6} /> : null}
        <span>{label}</span>
      </span>
      <div className="fader-body">
        <span className="fader-ticks" aria-hidden="true">
          {Array.from({ length: ticks }).map((_, index) => (
            <i
              key={index}
              className={index % 5 === 0 || index === ticks - 1 ? 'is-major' : undefined}
            />
          ))}
        </span>
        <div className="fader-track">
          <span className="fader-travel" aria-hidden="true">
            <span className="fader-thumb"><i /></span>
          </span>
          <input
            className="fader-input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayValue}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-valuetext={valueText}
            onChange={(event) => handleChange(Number(event.target.value))}
            onPointerUp={commit}
            onTouchEnd={commit}
            onKeyUp={handleKeyUp}
            onBlur={commit}
            onPointerDown={(event: ReactPointerEvent<HTMLInputElement>) => {
              // Range inputs handle drag themselves. Prevent a long-press context
              // menu on touch without disabling normal page scrolling elsewhere.
              if (event.pointerType === 'touch') event.currentTarget.focus();
            }}
          />
        </div>
      </div>
    </div>
  );
}
