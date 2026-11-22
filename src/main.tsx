/* SPDX-License-Identifier: GPL-3.0-only */

import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installSystemInsets } from './lib/engine/insets';
import './styles/base.css';
import './styles/shell.css';
import './styles/receiver.css';
import './styles/episode.css';
import './styles/transport.css';
import './styles/mobile.css';
import './styles/overlays.css';

// Android draws edge to edge but the WebView reports no safe-area insets, so the
// native side feeds them in as CSS variables before the first paint settles.
installSystemInsets();

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
createRoot(container).render(<App />);

// The desktop shell is already served from a fixed local origin; a service
// worker would only duplicate the bundled files and cache a stale API shell.
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.StayTunedDesktop?.isDesktop) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline shell is a progressive enhancement; the app works without it.
    });
  });
}
