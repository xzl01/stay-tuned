/* SPDX-License-Identifier: GPL-3.0-only */

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/shell.css';
import './styles/receiver.css';
import './styles/episode.css';
import './styles/transport.css';
import './styles/mobile.css';
import './styles/overlays.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
createRoot(container).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell is a progressive enhancement; the app works without it.
    });
  });
}
