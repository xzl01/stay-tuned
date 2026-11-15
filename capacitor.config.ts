/* SPDX-License-Identifier: GPL-3.0-only */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.xzl01.staytuned',
  appName: '留频',
  webDir: 'dist',
  android: {
    // The companion Node server is often reached over plain HTTP on the LAN.
    allowMixedContent: true,
    backgroundColor: '#efece4',
  },
  server: {
    // http://localhost keeps the WebView origin a secure context while letting
    // the page load plain HTTP media (many podcast hosts and LAN stations).
    androidScheme: 'http',
  },
};

export default config;
