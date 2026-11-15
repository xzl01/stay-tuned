# Third-party notices

This project is licensed under **GPL-3.0-only**. Third-party components remain under their own licenses. This file is the attribution summary; full license texts for direct dependencies and bundled assets are in [`third-party-licenses/`](third-party-licenses/).

## Runtime dependencies

| Package | Version | License | Full text |
| --- | --- | --- | --- |
| `@capacitor/android` | 8.6.2 | MIT | 见 npm 包内 LICENSE |
| `@capacitor/core` | 8.6.2 | MIT | 见 npm 包内 LICENSE |
| `@capacitor/filesystem` | 8.1.5 | MIT | 见 npm 包内 LICENSE |
| `@capacitor/share` | 8.0.3 | MIT | 见 npm 包内 LICENSE |
| `express` | 5.3.0 | MIT | [`express-MIT.txt`](third-party-licenses/express-MIT.txt) |
| `fast-xml-parser` | 5.12.1 | MIT | [`fast-xml-parser-MIT.txt`](third-party-licenses/fast-xml-parser-MIT.txt) |
| `hls.js` | 1.7.4 | Apache-2.0 | [`hls.js-Apache-2.0.txt`](third-party-licenses/hls.js-Apache-2.0.txt) |
| `react` | 19.3.1 | MIT | [`react-MIT.txt`](third-party-licenses/react-MIT.txt) |
| `react-dom` | 19.3.1 | MIT | [`react-dom-MIT.txt`](third-party-licenses/react-dom-MIT.txt) |

These packages are installed from npm; their complete license texts are distributed with the packages and copied here for the direct dependencies. The production dependency tree in [`package-lock.json`](package-lock.json) has 83 packages: 75 × MIT, 5 × ISC, 1 × Apache-2.0, 1 × BSD-3-Clause, 1 × 0BSD.0, 1 × BSD-3-Clause, 1 × 0BSD.0, 4 × ISC, 1 × BSD-3-Clause, 1 × 0BSD.0, 4 × ISC, 1 × BSD-3-Clause, 1 × 0BSD.

<details>
<summary>Transitive production dependencies (74)</summary>

| Package | Version | License |
| --- | --- | --- |
| `@capacitor/synapse` | 1.0.4 | ISC |
| `@nodable/entities` | 3.1.0 | MIT |
| `accepts` | 2.0.0 | MIT |
| `anynum` | 1.0.1 | MIT |
| `body-parser` | 2.4.0 | MIT |
| `bytes` | 3.1.2 | MIT |
| `call-bind-apply-helpers` | 1.0.2 | MIT |
| `call-bound` | 1.0.4 | MIT |
| `content-disposition` | 2.0.1 | MIT |
| `content-type` | 2.1.0 | MIT |
| `cookie` | 0.7.2 | MIT |
| `cookie-signature` | 1.2.2 | MIT |
| `debug` | 4.4.3 | MIT |
| `depd` | 2.0.0 | MIT |
| `dunder-proto` | 1.0.1 | MIT |
| `ee-first` | 1.1.1 | MIT |
| `encodeurl` | 2.0.3 | MIT |
| `es-define-property` | 1.0.1 | MIT |
| `es-errors` | 1.3.0 | MIT |
| `es-object-atoms` | 1.1.2 | MIT |
| `escape-html` | 1.0.3 | MIT |
| `etag` | 1.8.1 | MIT |
| `fast-xml-builder` | 1.3.2 | MIT |
| `finalhandler` | 2.1.1 | MIT |
| `forwarded` | 0.2.0 | MIT |
| `fresh` | 2.0.0 | MIT |
| `function-bind` | 1.1.2 | MIT |
| `get-intrinsic` | 1.3.0 | MIT |
| `get-proto` | 1.0.1 | MIT |
| `gopd` | 1.2.0 | MIT |
| `has-symbols` | 1.1.0 | MIT |
| `hasown` | 2.0.4 | MIT |
| `http-errors` | 2.0.1 | MIT |
| `iconv-lite` | 0.7.3 | MIT |
| `inherits` | 2.0.4 | ISC |
| `ipaddr.js` | 1.9.1 | MIT |
| `is-promise` | 4.0.0 | MIT |
| `is-unsafe` | 2.0.3 | MIT |
| `math-intrinsics` | 1.1.0 | MIT |
| `media-typer` | 1.1.1 | MIT |
| `merge-descriptors` | 2.0.0 | MIT |
| `mime-db` | 1.54.0 | MIT |
| `mime-types` | 3.0.2 | MIT |
| `ms` | 2.1.3 | MIT |
| `negotiator` | 1.1.0 | MIT |
| `object-inspect` | 1.13.4 | MIT |
| `on-finished` | 2.4.2 | MIT |
| `once` | 1.4.0 | ISC |
| `parseurl` | 1.3.3 | MIT |
| `path-expression-matcher` | 1.6.2 | MIT |
| `path-to-regexp` | 8.4.2 | MIT |
| `proxy-addr` | 2.0.8 | MIT |
| `qs` | 6.17.1 | BSD-3-Clause |
| `range-parser` | 1.3.0 | MIT |
| `raw-body` | 3.0.2 | MIT |
| `router` | 2.2.0 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `scheduler` | 0.28.0 | MIT |
| `send` | 1.2.1 | MIT |
| `serve-static` | 2.2.1 | MIT |
| `setprototypeof` | 1.2.0 | ISC |
| `side-channel` | 1.1.1 | MIT |
| `side-channel-list` | 1.0.1 | MIT |
| `side-channel-map` | 1.0.1 | MIT |
| `side-channel-weakmap` | 1.0.2 | MIT |
| `statuses` | 2.0.2 | MIT |
| `strnum` | 2.5.1 | MIT |
| `toidentifier` | 1.0.1 | MIT |
| `tslib` | 2.9.1 | 0BSD |
| `type-is` | 2.1.0 | MIT |
| `unpipe` | 1.0.0 | MIT |
| `vary` | 1.1.2 | MIT |
| `wrappy` | 1.0.2 | ISC |
| `xml-naming` | 0.3.0 | MIT |

</details>

## Development dependencies

Development tooling is not included in the runtime bundle. Direct dev dependencies and their licenses:

| Package | Version | License |
| --- | --- | --- |
| `@capacitor/cli` | 8.6.2 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.3.0 | MIT |
| `concurrently` | 10.0.7 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vite` | 8.3.8 | MIT |

## Bundled assets and fonts

| Asset | Version / source | License | Full text |
| --- | --- | --- | --- |
| Three.js and Three.js addons | 0.180.0, vendored under `src/components/receiver3d/vendor/` | MIT | [`three.js-MIT.txt`](third-party-licenses/three.js-MIT.txt) |
| hls.js | 1.7.4, npm runtime dependency | Apache-2.0 | [`hls.js-Apache-2.0.txt`](third-party-licenses/hls.js-Apache-2.0.txt) |
| Maple Mono | SIL OFL 1.1, upstream https://github.com/subframe7536/maple-font (v7 license) | OFL-1.1 | [`maple-mono-OFL-1.1.txt`](third-party-licenses/maple-mono-OFL-1.1.txt) |
| Fusion Pixel | 2026.11.10, upstream https://github.com/TakWolf/fusion-pixel-font | OFL-1.1 | [`fusion-pixel-OFL-1.1.txt`](third-party-licenses/fusion-pixel-OFL-1.1.txt) and `public/fonts/fusion-pixel/LICENSES/` |

## Project-generated content

Unless a file says otherwise, the following are original project assets released with the project under GPL-3.0-only:

- `public/audio/*.mp3`: demo ambience generated locally with ffmpeg; no commercial recordings are bundled.
- `public/icon.svg`, `public/shapes/`, `public/textures/`, `src/**/CoverArt` SVG/CSS artwork: generated for this project.
- `docs/design/references/` and `docs/design/prompts/`: design references and prompts generated for this project with the built-in image tool.
- `docs/screenshots/`: screenshots of this project.

## External services and marks

- Podcast directory search uses Apple Podcasts; radio search uses Radio Browser. Their APIs and data remain subject to their own terms.
- SomaFM, FIP, KEXP and other station names are used nominatively; live streams are not bundled. Their respective owners retain all rights.
- “Braun” and “Dieter Rams” are referenced only as design inspiration. This project is not affiliated with, endorsed by, or sponsored by Braun or Dieter Rams; no Braun product assets or trademarks are included.

## Compatibility

All runtime dependency licenses listed above are compatible with GPL-3.0-only. The only known missing standalone license file is `@nodable/entities`, a transitive package of `fast-xml-parser`; its npm metadata declares MIT. The license audit script checks every package recorded in the lockfile and fails on unknown or non-allowlisted license terms.

Run `npm run license:check` to repeat the audit. Generated content assets must be reviewed separately before adding new third-party images, audio, or fonts.
