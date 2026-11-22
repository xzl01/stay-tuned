#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * Sanity-check a built HAP.
 *
 * The package is easy to get subtly wrong: a missing permission, a stale
 * `rawfile/www`, a dropped form extension or a version that no longer matches
 * `package.json`. These failures do not break the build, only the install or a
 * feature on device, so check them here instead.
 *
 * Usage: node scripts/harmony-verify.mjs <path-to.hap>
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_ENTRIES = [
  'module.json',
  'resources.index',
  'ets/modules.abc',
  'resources/rawfile/www/index.html',
];
const REQUIRED_PERMISSIONS = [
  'ohos.permission.INTERNET',
  'ohos.permission.KEEP_BACKGROUND_RUNNING',
  'ohos.permission.VIBRATE',
];

function fail(message) {
  console.error(`[harmony-verify] ${message}`);
  process.exit(1);
}

function listEntries(hap) {
  return execFileSync('unzip', ['-Z1', hap], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readEntry(hap, name) {
  return execFileSync('unzip', ['-p', hap, name], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function main() {
  const hap = process.argv[2];
  if (!hap) fail('缺少 HAP 路径。');
  if (!existsSync(hap)) fail(`找不到 HAP：${hap}`);

  const entries = listEntries(hap);
  const missing = REQUIRED_ENTRIES.filter((entry) => !entries.includes(entry));
  if (missing.length > 0) fail(`包内缺少：${missing.join(', ')}`);

  const webAssets = entries.filter((entry) => entry.startsWith('resources/rawfile/www/assets/'));
  if (webAssets.length === 0) fail('rawfile/www 里没有前端资源，先跑 npm run harmony:sync。');

  const manifest = JSON.parse(readEntry(hap, 'module.json'));
  const module = manifest.module ?? {};
  const app = manifest.app ?? {};

  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (app.versionName !== pkg.version) {
    fail(`HAP 版本 ${app.versionName} 与 package.json 的 ${pkg.version} 不一致。`);
  }

  const permissions = (module.requestPermissions ?? []).map((item) => item.name);
  const missingPermissions = REQUIRED_PERMISSIONS.filter((name) => !permissions.includes(name));
  if (missingPermissions.length > 0) fail(`缺少权限：${missingPermissions.join(', ')}`);

  const extensions = (module.extensionAbilities ?? []).filter((item) => item.type === 'form');
  if (extensions.length === 0) fail('没有注册桌面卡片扩展（type: "form"）。');

  const wwwIndex = readEntry(hap, 'resources/rawfile/www/index.html');
  if (!wwwIndex.includes('./assets/')) {
    fail('rawfile/www/index.html 没有使用相对资源路径，resource:// 下会 404。');
  }

  console.log('[harmony-verify] ok');
  console.log(`  bundle      ${app.bundleName}`);
  console.log(`  version     ${app.versionName} (${app.versionCode})`);
  console.log(`  sdk         ${app.compileSdkVersion} / API ${app.targetAPIVersion}`);
  console.log(`  permissions ${permissions.length}`);
  console.log(`  extensions  ${extensions.map((item) => item.name).join(', ')}`);
  console.log(`  web assets  ${webAssets.length} files`);
}

main();
