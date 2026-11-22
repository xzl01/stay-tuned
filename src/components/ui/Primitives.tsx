/* SPDX-License-Identifier: GPL-3.0-only */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../Icon';
import { useAppStore } from '../../state/AppStore';
import { pulse } from '../../lib/haptics';

/* -------------------------------------------------------------------------- */
/* Sheet / drawer                                                             */
/* -------------------------------------------------------------------------- */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'bottom';
  className?: string;
  labelledBy?: string;
  /** 一镜到底的转场名；与源卡片共用，关闭时交还给卡片。 */
  transitionName?: string;
}

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  side = 'right',
  className = '',
  labelledBy,
  transitionName,
}: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeHandlerRef = useRef(onClose);
  closeHandlerRef.current = onClose;
  const settleTimer = useRef<number | null>(null);
  const titleId = useId();

  // Let the panel finish sliding in, then seat it with a soft tick.
  useEffect(() => {
    if (!open) return undefined;
    settleTimer.current = window.setTimeout(() => pulse('sheetOpen'), 240);
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    };
  }, [open]);

  const dismiss = useCallback(() => {
    pulse('sheetClose');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandlerRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`sheet-layer ${open ? 'is-open' : ''} sheet-layer--${side}`}>
      <div className="sheet-scrim" onClick={dismiss} aria-hidden="true" />
      <section
        ref={panelRef}
        className={`sheet-panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        aria-label={!title && !labelledBy ? '面板' : undefined}
        style={open && transitionName ? { viewTransitionName: transitionName } : undefined}
      >
        <header className="sheet-header">
          <div className="sheet-heading">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2 id={titleId}>{title}</h2> : null}
          </div>
          <button ref={closeRef} type="button" className="icon-button" onClick={dismiss} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="sheet-content">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
}

export function Switch({ checked, onChange, label, hideLabel = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => {
        pulse(checked ? 'toggleOff' : 'toggleOn');
        onChange(!checked);
      }}
    >
      <span className="switch-thumb" />
      {hideLabel ? null : <span className="switch-label">{label}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Popover menu                                                               */
/* -------------------------------------------------------------------------- */

export interface MenuOption {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
  onSelect: () => void;
}

interface MenuPopoverProps {
  trigger: ReactNode;
  options: MenuOption[];
  ariaLabel: string;
  className?: string;
  align?: 'start' | 'end';
  direction?: 'up' | 'down';
  active?: boolean;
  triggerClassName?: string;
  triggerTitle?: string;
}

export function MenuPopover({
  trigger,
  options,
  ariaLabel,
  className = '',
  align = 'end',
  direction = 'up',
  active = false,
  triggerClassName = '',
  triggerTitle,
}: MenuPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`menu-root ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`transport-action ${active || open ? 'is-active' : ''} ${triggerClassName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={triggerTitle}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={`menu-popover menu-popover--${align} menu-popover--${direction}`}
          role="menu"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.active}
              className={`menu-option ${option.active ? 'is-active' : ''}`}
              onClick={() => {
                pulse('press');
                option.onSelect();
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.detail ? <span className="menu-detail">{option.detail}</span> : null}
              {option.active ? <Icon name="check" size={15} className="menu-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export function ToastStack() {
  const { toasts, dismissToast } = useAppStore();
  if (!toasts.length) return null;
  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.tone}`}
          onClick={() => dismissToast(toast.id)}
        >
          <span className="toast-dot" aria-hidden="true" />
          <span>{toast.message}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Icon button                                                                */
/* -------------------------------------------------------------------------- */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  variant?: 'plain' | 'outline' | 'soft';
}

export function IconButton({ icon, label, size = 18, variant = 'plain', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--${variant} ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-mark" aria-hidden="true">
        <Icon name="radio" size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Spinner                                                                    */
/* -------------------------------------------------------------------------- */

export function Spinner({ label = '正在加载' }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <span />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Volume / range helpers                                                     */
/* -------------------------------------------------------------------------- */

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function sliderFill(value: number, max: number): string {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return `${pct}%`;
}

export function useHoverOpen(delay = 0): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const enter = useCallback(() => {
    clear();
    if (delay) timer.current = window.setTimeout(() => setOpen(true), delay);
    else setOpen(true);
  }, [clear, delay]);
  const leave = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);
  useEffect(() => clear, [clear]);
  return [open, enter, leave];
}
