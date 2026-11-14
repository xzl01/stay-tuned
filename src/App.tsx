/* SPDX-License-Identifier: GPL-3.0-only */

import { useCallback, useEffect, useState } from 'react';
import { AppStoreProvider, useAppStore } from './state/AppStore';
import { useIsMobile } from './hooks/useMediaQuery';
import { DesktopPlayer } from './components/DesktopPlayer';
import { MobilePlayer } from './components/MobilePlayer';
import { LibrarySheet } from './components/LibrarySheet';
import { QueueSheet } from './components/QueueSheet';
import { ToastStack } from './components/ui/Primitives';
import { Receiver3DEggContext } from './hooks/usePlayEasterEgg';
import { STATIC_DEMO } from './lib/env';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[role="dialog"]') !== null
  );
}

function AppShell() {
  const {
    prefs,
    togglePlay,
    skip,
    toggleMute,
    setTheme,
    notify,
  } = useAppStore();
  const isMobile = useIsMobile();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [receiver3DOpen, setReceiver3DOpen] = useState(false);
  const closeReceiver3D = useCallback(() => {
    setReceiver3DOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="receiver-play"]')?.focus({ preventScroll: true }));
  }, []);
  const openReceiver3D = useCallback(() => {
    if (prefs.mode === 'skeuo') setReceiver3DOpen(true);
  }, [prefs.mode]);

  useEffect(() => {
    if (prefs.mode !== 'skeuo') setReceiver3DOpen(false);
  }, [prefs.mode]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.mode = prefs.mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', prefs.theme === 'dark' ? '#121410' : '#efece4');
  }, [prefs.theme, prefs.mode]);

  useEffect(() => {
    if (!STATIC_DEMO) return;
    const timer = window.setTimeout(() => {
      notify('GitHub Pages 静态演示版：示例内容可播放；RSS、搜索、M3U 导入与代理流请在本机运行完整版。');
    }, 700);
    return () => window.clearTimeout(timer);
  }, [notify]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (libraryOpen || queueOpen) {
        if (event.key === 'Escape') {
          setLibraryOpen(false);
          setQueueOpen(false);
        }
        return;
      }
      if (receiver3DOpen && event.key === 'Escape') {
        closeReceiver3D();
        return;
      }
      if (target instanceof HTMLElement && target.closest('.receiver-3d-inline')) return;
      if (isTypingTarget(target)) return;
      if (event.key === ' ' || event.code === 'Space') {
        if (target instanceof HTMLElement && target.tagName === 'BUTTON') return;
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        skip(-15);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        skip(30);
      } else if (event.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (event.key.toLowerCase() === 'l') {
        setLibraryOpen(true);
      } else if (event.key.toLowerCase() === 'q') {
        setQueueOpen(true);
      } else if (event.key.toLowerCase() === 'd') {
        setTheme(prefs.theme === 'light' ? 'dark' : 'light');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [libraryOpen, queueOpen, receiver3DOpen, closeReceiver3D, prefs.theme, skip, setTheme, toggleMute, togglePlay]);

  const openLibrary = () => {
    setQueueOpen(false);
    setLibraryOpen(true);
  };
  const openQueue = () => {
    setLibraryOpen(false);
    setQueueOpen(true);
  };

  return (
    <Receiver3DEggContext.Provider value={{ active: receiver3DOpen, open: openReceiver3D, close: closeReceiver3D }}>
    <div className="app-root">
      <div className="atmosphere" aria-hidden="true">
        <span className="atmosphere-glow atmosphere-glow--warm" />
        <span className="atmosphere-glow atmosphere-glow--olive" />
        <span className="atmosphere-grain" />
        <span className="atmosphere-vignette" />
      </div>

      {isMobile ? (
        <MobilePlayer onOpenLibrary={openLibrary} onOpenQueue={openQueue} />
      ) : (
        <DesktopPlayer onOpenLibrary={openLibrary} onOpenQueue={openQueue} />
      )}

      <LibrarySheet open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} onBrowse={openLibrary} />
      <ToastStack />

    </div>
    </Receiver3DEggContext.Provider>
  );
}

export function App() {
  return (
    <AppStoreProvider>
      <AppShell />
    </AppStoreProvider>
  );
}
