/// <reference types="vite/client" />

/** Injected by vite.config.ts from package.json. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_STATIC_DEMO?: string;
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface StayTunedDesktopInfo {
  desktop: boolean;
  origin: string;
  platform: string;
  arch: string;
  version: string;
  error?: string | null;
}

interface StayTunedDesktopBridge {
  isDesktop: boolean;
  info: () => Promise<StayTunedDesktopInfo>;
}

interface Window {
  StayTunedDesktop?: StayTunedDesktopBridge;
}
