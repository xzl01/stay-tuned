#!/usr/bin/env python3
"""SPDX-License-Identifier: GPL-3.0-only

Regenerate the Android launcher icons, splash screens and PWA icon from the
brand SVGs in scripts/assets/. Requires rsvg-convert + ImageMagick.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'scripts' / 'assets'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

SPLASH_SIZES = {
    'drawable': (480, 320),
    'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800),
    'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600),
    'drawable-port-xxxhdpi': (1280, 1920),
    'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480),
    'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960),
    'drawable-land-xxxhdpi': (1920, 1280),
}
CREAM = '#efece4'


def render(src: Path, size: int, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(src), '-o', str(out)], check=True)


def main() -> int:
    full = ASSETS / 'icon-full.svg'
    adaptive = ASSETS / 'icon-adaptive-fg.svg'
    if not full.exists() or not adaptive.exists():
        print('missing brand svg in scripts/assets', file=sys.stderr)
        return 1

    for name, scale in DENSITIES.items():
        folder = RES / f'mipmap-{name}'
        legacy = int(48 * scale)
        render(full, legacy, folder / 'ic_launcher.png')
        render(full, legacy, folder / 'ic_launcher_round.png')
        render(adaptive, int(108 * scale), folder / 'ic_launcher_foreground.png')

    logo = ASSETS / 'icon-full.svg'
    for folder, (width, height) in SPLASH_SIZES.items():
        target = RES / folder
        target.mkdir(parents=True, exist_ok=True)
        logo_px = int(min(width, height) * 0.34)
        tmp = Path('/tmp') / f'splash-{width}x{height}.png'
        render(logo, logo_px, tmp)
        subprocess.run(
            ['magick', '-size', f'{width}x{height}', f'xc:{CREAM}', str(tmp), '-gravity', 'center', '-composite', str(target / 'splash.png')],
            check=True,
        )
    print('android icons + splash regenerated')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
