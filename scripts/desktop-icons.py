#!/usr/bin/env python3
"""SPDX-License-Identifier: GPL-3.0-only

Generate desktop application icons from the brand SVG without external image
tools. Pillow draws the same geometry as scripts/assets/icon-full.svg.
"""
from pathlib import Path
import struct
from io import BytesIO

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
S = 1024
CREAM = (239, 236, 228, 255)
INK = (38, 40, 31, 255)
OLIVE = (58, 64, 48, 188)
ORANGE = (192, 90, 50, 255)


def draw_icon(size):
    k = size / 512
    img = Image.new('RGBA', (size, size), CREAM)
    d = ImageDraw.Draw(img, 'RGBA')

    def box(x, y, w, h, r, color, width):
        d.rounded_rectangle((x*k, y*k, (x+w)*k, (y+h)*k), radius=r*k,
                            outline=color, width=max(1, round(width*k)))

    def bar(x, y1, y2, color, width):
        d.line((x*k, y1*k, x*k, y2*k), fill=color,
               width=max(1, round(width*k)), joint='curve')
        r = width*k/2
        d.ellipse((x*k-r, y1*k-r, x*k+r, y1*k+r), fill=color)
        d.ellipse((x*k-r, y2*k-r, x*k+r, y2*k+r), fill=color)

    box(96, 96, 320, 320, 116, INK, 20)
    box(137, 137, 238, 238, 67, INK, 15)
    for args in [(178, 222, 340), (233, 186, 376), (288, 236, 326)]:
        bar(*args, OLIVE, 13)
    for args in [(345, 142, 370), (401, 196, 316)]:
        bar(*args, ORANGE, 15)
    return img


def write_pngs(base):
    BUILD.mkdir(parents=True, exist_ok=True)
    base.save(BUILD / 'icon.png')
    icons = BUILD / 'icons'
    icons.mkdir(exist_ok=True)
    for n in (16, 24, 32, 48, 64, 96, 128, 256, 512, 1024):
        base.resize((n, n), Image.Resampling.LANCZOS).save(
            icons / (str(n) + 'x' + str(n) + '.png'))


def write_ico(base):
    # PNG-compressed ICO entries; valid on Windows and accepted by builder.
    sizes = [16, 24, 32, 48, 64, 96, 128, 256]
    entries = []
    for n in sizes:
        buf = BytesIO()
        base.resize((n, n), Image.Resampling.LANCZOS).save(buf, format='PNG')
        entries.append((n, buf.getvalue()))
    header = struct.pack('<HHH', 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    directory, blobs = b'', b''
    for n, data in entries:
        directory += struct.pack('<BBBBHHII',
                                 n if n < 256 else 0, n if n < 256 else 0,
                                 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    (BUILD / 'icon.ico').write_bytes(header + directory + blobs)


# ICNS element types and the pixel size each one carries.
ICNS_TYPES = (
    (b'ic07', 128),
    (b'ic08', 256),
    (b'ic09', 512),
    (b'ic10', 1024),
    (b'ic11', 32),
    (b'ic12', 64),
    (b'ic13', 256),
    (b'ic14', 512),
)


def write_icns(base):
    # Build the .icns container directly instead of shelling out to iconutil,
    # which only exists on macOS. The format is a header plus tagged PNG
    # chunks, so this works on every CI runner and keeps the output identical.
    chunks = b''
    for tag, size in ICNS_TYPES:
        buf = BytesIO()
        base.resize((size, size), Image.Resampling.LANCZOS).save(buf, format='PNG')
        data = buf.getvalue()
        chunks += tag + struct.pack('>I', len(data) + 8) + data
    (BUILD / 'icon.icns').write_bytes(b'icns' + struct.pack('>I', len(chunks) + 8) + chunks)


def main():
    base = draw_icon(S)
    write_pngs(base)
    write_ico(base)
    write_icns(base)
    print('desktop icons written to build/: icon.png, icon.ico, icon.icns, icons/')


if __name__ == '__main__':
    main()
