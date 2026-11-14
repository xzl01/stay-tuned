/* SPDX-License-Identifier: GPL-3.0-only */

import { BrandMark, Icon } from './Icon';
import type { Mode, Theme } from '../types';
import { useAppStore } from '../state/AppStore';
import { MenuPopover, type MenuOption } from './ui/Primitives';

interface HeaderProps {
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
}

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

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="header-icon-button"
      onClick={onToggle}
      aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      title={theme === 'light' ? '深色' : '浅色'}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={19} />
    </button>
  );
}

function HeaderAppearanceMenu() {
  const { prefs, setMode, setTheme } = useAppStore();
  const options: MenuOption[] = [
    {
      id: 'skeuo',
      label: '拟物外观',
      active: prefs.mode === 'skeuo',
      onSelect: () => setMode('skeuo'),
    },
    {
      id: 'flat',
      label: '扁平外观',
      active: prefs.mode === 'flat',
      onSelect: () => setMode('flat'),
    },
    {
      id: 'light',
      label: '浅色主题',
      active: prefs.theme === 'light',
      onSelect: () => setTheme('light'),
    },
    {
      id: 'dark',
      label: '深色主题',
      active: prefs.theme === 'dark',
      onSelect: () => setTheme('dark'),
    },
  ];
  return (
    <MenuPopover
      trigger={<Icon name={prefs.theme === 'light' ? 'sun' : 'moon'} size={19} />}
      triggerClassName="header-appearance-trigger"
      triggerTitle="外观设置"
      options={options}
      ariaLabel="外观设置"
      align="end"
      direction="down"
    />
  );
}

export function DesktopHeader({ onOpenLibrary, onOpenQueue }: HeaderProps) {
  const { queue } = useAppStore();
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
        <HeaderAppearanceMenu />
        <span className="header-rule" aria-hidden="true" />
        <button type="button" className="header-link header-link--plain" onClick={onOpenLibrary}>
          <span>我的订阅</span>
        </button>
        <span className="header-rule" aria-hidden="true" />
        <button type="button" className="header-link" onClick={onOpenQueue}>
          <Icon name="queue" size={18} />
          <span>播放队列</span>
          <span className="queue-badge" aria-label={`${queue.length} 项`}>{queue.length}</span>
        </button>
      </div>
    </header>
  );
}

export function MobileHeader({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const { prefs, setMode, setTheme } = useAppStore();
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
          <Icon name="library" size={17} />
        </button>
        <ModeToggle mode={prefs.mode} onChange={setMode} compact />
        <ThemeButton theme={prefs.theme} onToggle={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')} />
      </div>
    </header>
  );
}
