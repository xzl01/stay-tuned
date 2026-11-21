#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * Build the HarmonyOS package without DevEco Studio.
 *
 * hvigor is a normal npm library, so a headless build only needs three things:
 *   - the OpenHarmony SDK (`OHOS_BASE_SDK_HOME`), laid out as `<root>/<api>/ets`
 *   - `@ohos/hvigor` + `@ohos/hvigor-ohos-plugin` from the HarmonyOS registry
 *   - the web bundle from `npm run harmony:sync`
 *
 * Usage:
 *   OHOS_BASE_SDK_HOME=/path/to/sdk npm run harmony:hap
 *   OHOS_BASE_SDK_HOME=/path/to/sdk npm run harmony:hap -- assembleHap --mode module
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(ROOT, 'harmony');
const TOOLS = path.join(ROOT, '.harmony-tools');
const REGISTRY = 'https://repo.harmonyos.com/npm/';
const HVIGOR_VERSION = process.env.HVIGOR_VERSION || '6.26.20';

function fail(message) {
  console.error(`[harmony] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env || {}) },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

/** Install hvigor into a gitignored toolchain folder, once. */
function ensureHvigor() {
  const entry = path.join(TOOLS, 'node_modules/@ohos/hvigor/bin/hvigor.js');
  const plugin = path.join(TOOLS, 'node_modules/@ohos/hvigor-ohos-plugin');
  if (existsSync(entry) && existsSync(plugin)) return entry;

  console.log(`[harmony] 安装 hvigor ${HVIGOR_VERSION}（HarmonyOS registry）…`);
  mkdirSync(TOOLS, { recursive: true });
  writeFileSync(
    path.join(TOOLS, 'package.json'),
    JSON.stringify({ name: 'stay-tuned-harmony-tools', private: true, version: '1.0.0' }, null, 2),
  );
  run(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      '--prefix',
      TOOLS,
      '--cache',
      path.join(TOOLS, '.npm-cache'),
      '--registry',
      REGISTRY,
      '--no-audit',
      '--no-fund',
      `@ohos/hvigor@${HVIGOR_VERSION}`,
      `@ohos/hvigor-ohos-plugin@${HVIGOR_VERSION}`,
    ],
  );
  if (!existsSync(entry)) fail('hvigor 安装后仍找不到可执行入口。');
  return entry;
}

/**
 * The HAP packer shells out to `java`. macOS ships a stub that only prints
 * "Unable to locate a Java Runtime", so look for a real JDK before building.
 */
function resolveJavaHome() {
  const configured = process.env.JAVA_HOME;
  if (configured && existsSync(path.join(configured, 'bin/java'))) return configured;
  if (process.platform === 'darwin') {
    const probe = spawnSync('/usr/libexec/java_home', [], { encoding: 'utf8' });
    const found = (probe.stdout || '').trim();
    if (probe.status === 0 && found) return found;
  }
  console.warn(
    '[harmony] 未找到 JDK。打包 HAP 需要 JDK 17+，请设置 JAVA_HOME（例如 Temurin 17）。',
  );
  return '';
}

function resolveSdk() {
  const openHarmony = process.env.OHOS_BASE_SDK_HOME;
  const harmony = process.env.DEVECO_SDK_HOME;
  if (openHarmony) return { env: { OHOS_BASE_SDK_HOME: openHarmony }, label: openHarmony };
  if (harmony) return { env: { DEVECO_SDK_HOME: harmony }, label: harmony };
  fail(
    '未设置 SDK 环境变量。请设置 OHOS_BASE_SDK_HOME（OpenHarmony SDK 根目录，' +
      '内含 <api>/ets、<api>/js、<api>/toolchains）或 DEVECO_SDK_HOME（DevEco Studio 的 SDK）。',
  );
  return { env: {}, label: '' };
}

function main() {
  const sdk = resolveSdk();
  if (!existsSync(path.join(PROJECT, 'hvigor/hvigor-config.json5'))) {
    fail('harmony/ 工程不完整，缺少 hvigor 配置。');
  }
  const www = path.join(PROJECT, 'entry/src/main/resources/rawfile/www/index.html');
  if (!existsSync(www)) {
    fail('缺少前端资源。请先运行 npm run harmony:sync。');
  }

  const hvigorEntry = ensureHvigor();
  const args = process.argv.slice(2);
  const finalArgs = args.length ? args : ['assembleHap'];
  const javaHome = resolveJavaHome();

  console.log(`[harmony] SDK: ${sdk.label}`);
  console.log(`[harmony] hvigor ${HVIGOR_VERSION}: ${finalArgs.join(' ')}`);

  const toolchains = [
    path.join(sdk.label, '20/toolchains'),
    path.join(sdk.label, 'toolchains'),
  ].filter((candidate) => existsSync(candidate));

  const env = {
    ...sdk.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    // Keep hvigor's cache inside the repo so CI and local runs behave the same.
    HVIGOR_USER_HOME: process.env.HVIGOR_USER_HOME || path.join(TOOLS, 'hvigor-home'),
    NODE_PATH: path.join(TOOLS, 'node_modules'),
    PATH: [...toolchains, process.env.PATH || ''].join(path.delimiter),
  };

  run(process.execPath, [hvigorEntry, ...finalArgs], { cwd: PROJECT, env });
}

main();
