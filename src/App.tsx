/* SPDX-License-Identifier: GPL-3.0-only */

import { useCallback, useEffect, useState } from 'react';
import { AppStoreProvider, useAppStore } from './state/AppStore';
import { useIsMobile } from './hooks/useMediaQuery';
import { DesktopPlayer } from './components/DesktopPlayer';
import { MobilePlayer } from './components/MobilePlayer';
import { LibrarySheet } from './components/LibrarySheet';
import { QueueSheet } from './components/QueueSheet';
import { ServerSheet } from './components/ServerSheet';
import { DataSheet } from './components/DataSheet';
import { CacheSheet } from './components/CacheSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { ToastStack } from './components/ui/Primitives';
import { Receiver3DEggContext } from './hooks/usePlayEasterEgg';
import { STATIC_DEMO } from './lib/env';
import { pushSystemBars } from './lib/engine/harmonyChrome';

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
    resolvedTheme,
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
  const [serverOpen, setServerOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [cacheOpen, setCacheOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Nothing on screen needs to animate while the app is in the background.
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.background = document.hidden ? 'true' : 'false';
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.mode = prefs.mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolvedTheme === 'dark' ? '#121410' : '#efece4');
    // HarmonyOS draws the system bars over the page, so their icons must follow.
    pushSystemBars(resolvedTheme === 'dark');
  }, [resolvedTheme, prefs.mode]);

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
      // Any open sheet owns the keyboard. Otherwise Space / arrows / M / Q / L
      // would toggle playback while the user is typing in a dialog.
      const sheetOpen = libraryOpen || queueOpen || serverOpen || dataOpen || cacheOpen || settingsOpen;
      if (sheetOpen) {
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
        // Toggle against what is actually on screen, so it also leaves 'system'.
        setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    libraryOpen,
    queueOpen,
    serverOpen,
    dataOpen,
    cacheOpen,
    settingsOpen,
    receiver3DOpen,
    closeReceiver3D,
    resolvedTheme,
    skip,
    setTheme,
    toggleMute,
    togglePlay,
  ]);

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
        <MobilePlayer
          onOpenLibrary={openLibrary}
          onOpenQueue={openQueue}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <DesktopPlayer
          onOpenLibrary={openLibrary}
          onOpenQueue={openQueue}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <LibrarySheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onOpenSettings={() => {
          setLibraryOpen(false);
          setSettingsOpen(true);
        }}
      />
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} onBrowse={openLibrary} />
      <ServerSheet open={serverOpen} onClose={() => setServerOpen(false)} />
      <DataSheet open={dataOpen} onClose={() => setDataOpen(false)} />
      <CacheSheet open={cacheOpen} onClose={() => setCacheOpen(false)} />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenCache={() => {
          setSettingsOpen(false);
          setCacheOpen(true);
        }}
        onOpenData={() => {
          setSettingsOpen(false);
          setDataOpen(true);
        }}
        onOpenServer={() => {
          setSettingsOpen(false);
          setServerOpen(true);
        }}
      />
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
