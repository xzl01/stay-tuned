#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */
/**
 * Regenerate the dependency tables in THIRD_PARTY_NOTICES.md from
 * package-lock.json. Run after adding or removing a dependency.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const rootPkg = lock.packages[''] ?? {};
const direct = new Set(Object.keys(rootPkg.dependencies ?? {}));
const directDev = new Set(Object.keys(rootPkg.devDependencies ?? {}));

const LICENSE_FILES = {
  express: 'express-MIT.txt',
  'fast-xml-parser': 'fast-xml-parser-MIT.txt',
  'hls.js': 'hls.js-Apache-2.0.txt',
  react: 'react-MIT.txt',
  'react-dom': 'react-dom-MIT.txt',
};

const seen = new Set();
function walk(deps) {
  for (const name of Object.keys(deps ?? {})) {
    const key = `node_modules/${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    walk(lock.packages[key]?.dependencies);
  }
}
walk(rootPkg.dependencies);

const rows = [];
for (const key of [...seen].sort((a, b) => a.localeCompare(b))) {
  const meta = lock.packages[key];
  if (!meta) continue;
  const name = key.replace(/^node_modules\//, '');
  rows.push({ name, version: meta.version, license: meta.license ?? 'UNKNOWN', direct: direct.has(name) });
}
const counts = {};
for (const row of rows) counts[row.license] = (counts[row.license] ?? 0) + 1;
const directRows = rows.filter((row) => row.direct);
const transitiveRows = rows.filter((row) => !row.direct);

const runtimeTable = directRows
  .map((row) => {
    const file = LICENSE_FILES[row.name];
    const link = file ? `[\`${file}\`](third-party-licenses/${file})` : '见 npm 包内 LICENSE';
    return `| \`${row.name}\` | ${row.version} | ${row.license} | ${link} |`;
  })
  .join('\n');

const transitiveTable = transitiveRows
  .map((row) => `| \`${row.name}\` | ${row.version} | ${row.license} |`)
  .join('\n');

const devTable = [...directDev]
  .sort()
  .map((name) => {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
      return `| \`${name}\` | ${meta.version} | ${meta.license ?? 'UNKNOWN'} |`;
    } catch {
      return `| \`${name}\` | — | — |`;
    }
  })
  .join('\n');

const file = path.join(root, 'THIRD_PARTY_NOTICES.md');
let out = fs.readFileSync(file, 'utf8');

out = out.replace(
  /## Runtime dependencies\n\n\| Package \| Version \| License \| Full text \|\n\| --- \| --- \| --- \| --- \|\n([\s\S]*?)\n\nThese packages/,
  `## Runtime dependencies\n\n| Package | Version | License | Full text |\n| --- | --- | --- | --- |\n${runtimeTable}\n\nThese packages`,
);
out = out.replace(
  /has \d+ packages: [^.]+\./,
  `has ${rows.length} packages: ${Object.entries(counts)
    .map(([license, count]) => `${count} × ${license}`)
    .join(', ')}.`,
);
out = out.replace(
  /<summary>Transitive production dependencies \(\d+\)<\/summary>\n\n\| Package \| Version \| License \|\n\| --- \| --- \| --- \|\n([\s\S]*?)\n\n<\/details>/,
  `<summary>Transitive production dependencies (${transitiveRows.length})</summary>\n\n| Package | Version | License |\n| --- | --- | --- |\n${transitiveTable}\n\n</details>`,
);
out = out.replace(
  /## Development dependencies\n\n[\s\S]*?\n\n## Bundled assets/,
  `## Development dependencies\n\nDevelopment tooling is not included in the runtime bundle. Direct dev dependencies and their licenses:\n\n| Package | Version | License |\n| --- | --- | --- |\n${devTable}\n\n## Bundled assets`,
);

fs.writeFileSync(file, out);
console.log(`Updated THIRD_PARTY_NOTICES.md — ${rows.length} runtime packages, ${transitiveRows.length} transitive.`);
