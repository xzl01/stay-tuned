/* SPDX-License-Identifier: GPL-3.0-only */

import { BrandMark, Icon } from './Icon';
import type { Mode } from '../types';
import { useAppStore } from '../state/AppStore';

interface HeaderProps {
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
  onOpenSettings: () => void;
}

/**
 * Texture switch. Theme and haptics are preferences and live in Settings only;
 * texture stays in the header because it is the one appearance choice that
 * changes the whole silhouette at a glance.
 */
function ModeToggle({ mode, onChange, compact = false }: { mode: Mode; onChange: (mode: Mode) => void; compact?: boolean }) {
  return (
    <div className={`mode-toggle ${compact ? 'mode-toggle--compact' : ''}`} role="group" aria-label="界面质感">
      <button
        type="button"
        className={mode === 'skeuo' ? 'is-active' : ''}
        aria-pressed={mode === 'skeuo'}
        onClick={() => onChange('skeuo')}
      >
        拟物
      </button>
      <button
        type="button"
        className={mode === 'flat' ? 'is-active' : ''}
        aria-pressed={mode === 'flat'}
        onClick={() => onChange('flat')}
      >
        扁平
      </button>
    </div>
  );
}

export function DesktopHeader({ onOpenLibrary, onOpenQueue, onOpenSettings }: HeaderProps) {
  const { queue, prefs, setMode } = useAppStore();
  return (
    <header className="site-header site-header--desktop">
      <div className="brand-cluster">
        <a className="brand" href="#now-playing" aria-label="留频 · 回到正在收听">
          <BrandMark size={39} />
          <span className="brand-word">留频</span>
        </a>
        <span className="header-rule" aria-hidden="true" />
        <span className="brand-tagline">播客播放器</span>
      </div>

      <div className="header-actions">
        <ModeToggle mode={prefs.mode} onChange={setMode} compact />
        <span className="header-rule" aria-hidden="true" />
        <button type="button" className="header-library-button" onClick={onOpenLibrary}>
          <Icon name="library" size={19} />
          <span>我的订阅</span>
        </button>
        <span className="header-rule" aria-hidden="true" />
        <button type="button" className="header-link" onClick={onOpenQueue}>
          <Icon name="queue" size={18} />
          <span>播放队列</span>
          <span className="queue-badge" aria-label={`${queue.length} 项`}>{queue.length}</span>
        </button>
        <span className="header-rule" aria-hidden="true" />
        <button
          type="button"
          className="header-icon-button"
          onClick={onOpenSettings}
          aria-label="设置"
          title="设置"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>
    </header>
  );
}

export function MobileHeader({ onOpenLibrary, onOpenSettings }: { onOpenLibrary: () => void; onOpenSettings: () => void }) {
  const { prefs, setMode } = useAppStore();
  return (
    <header className="site-header site-header--mobile">
      <button
        type="button"
        className="mobile-brand"
        onClick={onOpenLibrary}
        aria-label="留频 · 打开我的订阅"
        title="我的订阅"
      >
        <BrandMark size={34} />
        <span className="brand-word">留频</span>
      </button>
      <div className="mobile-header-actions">
        <button
          type="button"
          className="header-icon-button mobile-library-button"
          onClick={onOpenLibrary}
          aria-label="打开我的订阅"
          title="我的订阅"
        >
          <Icon name="library" size={20} />
        </button>
        <ModeToggle mode={prefs.mode} onChange={setMode} compact />
        <button
          type="button"
          className="header-icon-button"
          onClick={onOpenSettings}
          aria-label="设置"
          title="设置"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>
    </header>
  );
}
