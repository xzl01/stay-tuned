/* SPDX-License-Identifier: GPL-3.0-only */

// CommonJS preload: sandboxed Electron preloads cannot use ESM imports.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('StayTunedDesktop', {
  isDesktop: true,
  info: () => ipcRenderer.invoke('desktop:info'),
});
