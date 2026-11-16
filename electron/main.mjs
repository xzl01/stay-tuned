/* SPDX-License-Identifier: GPL-3.0-only */

// Electron's main process uses Node's ESM loader here (root package.json has
// "type": "module"). Electron's API must be loaded with createRequire; named
// ESM imports resolve to the npm package shim and fail at runtime.
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, '..');
const DESKTOP_HOST = '127.0.0.1';
const DESKTOP_PORT = Number(process.env.STAY_TUNED_DESKTOP_PORT) || 18787;
const DESKTOP_ORIGIN = 'http://' + DESKTOP_HOST + ':' + DESKTOP_PORT;
const DESKTOP_APP_ID = 'stay-tuned-desktop';

let server = null;
let mainWindow = null;
let startupError = null;

app.setName('留频');

function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === DESKTOP_ORIGIN ||
      (parsed.protocol === 'file:' && url.startsWith('file://' + APP_ROOT));
  } catch {
    return false;
  }
}

function showStartupError(error) {
  startupError = error instanceof Error ? error.message : String(error);
  console.error('[stay-tuned desktop]', startupError);
  if (app.isReady()) dialog.showErrorBox('留频启动失败', startupError);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    title: '留频 · Stay Tuned',
    backgroundColor: '#efece4',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      partition: 'persist:' + DESKTOP_APP_ID,
    },
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') console.error('[stay-tuned desktop] renderer gone:', details.reason);
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));

  return mainWindow.loadURL(DESKTOP_ORIGIN + '/');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  ipcMain.handle('desktop:info', () => ({
    desktop: true,
    origin: DESKTOP_ORIGIN,
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    error: startupError,
  }));

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'mediaKeySystem');
    });
    try {
      // Electron 45 reads asar entries in place. The static bundle is unpacked
      // so express.static always sees real files instead of asar descriptors.
      const unpackedDist = path.resolve(app.getAppPath(), '..', 'app.asar.unpacked', 'dist');
      const inAsarDist = path.join(app.getAppPath(), 'dist');
      process.env.STAY_TUNED_DIST = fs.existsSync(path.join(unpackedDist, 'index.html'))
        ? unpackedDist
        : inAsarDist;
      const { startServer } = await import('../server/index.mjs');
      server = await startServer({
        port: DESKTOP_PORT,
        host: DESKTOP_HOST,
        corsOrigins: [DESKTOP_ORIGIN, 'http://localhost:' + DESKTOP_PORT],
        quiet: true,
      });
      await createWindow();
    } catch (error) {
      const busy = error && error.code === 'EADDRINUSE';
      showStartupError(busy
        ? '端口 ' + DESKTOP_PORT + ' 已被占用。请关闭占用程序，或设置 STAY_TUNED_DESKTOP_PORT 后重试。'
        : error);
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && server) void createWindow();
  });

  app.on('before-quit', () => {
    if (server) server.close();
    server = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
