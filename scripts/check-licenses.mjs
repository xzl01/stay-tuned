#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Permissive licenses compatible with distributing the combined work under
// GPL-3.0-only. Apache-2.0 is GPLv3-compatible; MPL-2.0 files are kept under
// MPL-2.0 where applicable and are not relicensed.
const ALLOWED = new Set([
  '0BSD',
  'BlueOak-1.0.0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'Unlicense',
]);
const OPERATORS = new Set(['AND', 'OR', 'WITH', '(', ')']);

function tokensOf(expression) {
  return String(expression ?? '')
    .replace(/[()]/g, ' $& ')
    .split(/\s+/)
    .filter(Boolean);
}

const problems = [];
const counts = {};
for (const [location, meta] of Object.entries(lock.packages ?? {})) {
  if (!location.startsWith('node_modules/')) continue;
  const license = meta.license;
  if (!license) {
    problems.push(`${location}: missing license metadata`);
    continue;
  }
  counts[license] = (counts[license] ?? 0) + 1;
  for (const token of tokensOf(license)) {
    if (OPERATORS.has(token)) continue;
    if (!ALLOWED.has(token)) problems.push(`${location}: license "${license}" contains non-allowlisted term "${token}"`);
  }
}

if (pkg.license !== 'GPL-3.0-only') {
  problems.push('package.json: license must be "GPL-3.0-only"');
}

for (const required of [
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
  'third-party-licenses/hls.js-Apache-2.0.txt',
  'third-party-licenses/three.js-MIT.txt',
  'third-party-licenses/maple-mono-OFL-1.1.txt',
  'third-party-licenses/fusion-pixel-OFL-1.1.txt',
  'public/fonts/MAPLE-MONO-OFL.txt',
]) {
  if (!fs.existsSync(path.join(root, required))) problems.push(`missing required compliance file: ${required}`);
}

if (problems.length) {
  console.error('License compliance check failed:\n');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  const summary = Object.entries(counts).map(([license, count]) => `${count}× ${license}`).join(', ');
  console.log(`License compliance check passed: ${Object.keys(lock.packages).filter((p) => p.startsWith('node_modules/')).length} npm packages (${summary}).`);
}
