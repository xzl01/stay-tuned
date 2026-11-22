/* SPDX-License-Identifier: GPL-3.0-only */

import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The sample audio only exists for the GitHub Pages showcase. Real builds would
 * otherwise ship three unused MP3s (about 14 MB) inside every APK and HAP.
 *
 * The output directory is read from the resolved config, not hard-coded: the
 * HarmonyOS bundle is built into `.harmony-dist` and would otherwise keep them.
 */
function dropDemoAudio(): Plugin {
  let outDir = '';
  return {
    name: 'stay-tuned:drop-demo-audio',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env.VITE_STATIC_DEMO === '1') return;
      if (!outDir) return;
      rmSync(path.join(outDir, 'audio'), { recursive: true, force: true });
    },
  };
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), dropDemoAudio()],
  // Surfaced in Settings → 关于 without shipping the whole package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
