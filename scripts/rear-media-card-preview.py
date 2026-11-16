#!/usr/bin/env python3
"""SPDX-License-Identifier: GPL-3.0-only

Render a desktop preview of the MediaSession artwork used by Xiaomi rear-screen
music cards. Mirrors the native Canvas drawing in PlaybackService.receiverCard().
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'screenshots' / 'xiaomi-rear-media-card.png'
W = H = 640
FONT_PATHS = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]


def font(size):
    for path in FONT_PATHS:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


def draw(dark=False, flat=False):
    page = '#181b17' if dark else '#f7f6f0'
    shell = '#2b2f28' if dark else '#efece4'
    edge = '#3d4238' if dark else '#d8d3c4'
    ink = '#e8e7df' if dark else '#30342e'
    muted = '#a3a99b' if dark else '#6b6f5f'
    lcd = '#3a4539' if dark else '#a5ac91'
    lcd_ink = '#d7dfce' if dark else '#35402e'
    img = Image.new('RGB', (W, H), page)
    d = ImageDraw.Draw(img)
    left, top, right, bottom = 42, 130, W - 42, 510
    shadow = shell if flat else ('#20241f' if dark else '#e8e4d8')
    d.rounded_rectangle((left + 8, top + 14, right + 8, bottom + 18), radius=34, fill=shadow)
    d.rounded_rectangle((left, top, right, bottom), radius=34, fill=shell, outline=edge, width=3)
    for y in range(top + 42, bottom - 61, 18):
        for x in range(left + 28, left + 246, 18):
            d.ellipse((x - 2.6, y - 2.6, x + 2.6, y + 2.6), fill=ink)
    sl, st, sr, sb = left + 280, top + 42, right - 30, top + 138
    d.rounded_rectangle((sl, st, sr, sb), radius=14, fill=lcd, outline=lcd_ink, width=3)
    d.text((sl + 18, st + 10), '▶', font=font(24), fill=lcd_ink)
    d.text((sr - 78, st + 10), '18:42', font=font(24), fill=lcd_ink)
    d.text((sl + 18, st + 48), '02  专注与留白', font=font(24), fill=lcd_ink)
    for label, y, pos, color in [('章节', st + 132, 0.58, '#c05a32'), ('音量', st + 200, 0.72, '#6b705d')]:
        d.text((sl - 2, y - 28), label, font=font(18), fill=ink)
        d.line((sl, y, sr - 18, y), fill='#5f6457', width=5)
        for i in range(9):
            x = sl + (sr - 18 - sl) * i / 8
            d.line((x, y - 14, x, y - 7), fill='#9a9d8e', width=3)
        tx = sl + (sr - 18 - sl) * pos
        d.rounded_rectangle((tx - 22, y - 17, tx + 22, y + 17), radius=8,
                            fill='#3a4036' if dark else '#f4f1e8', outline='#c9c4b6', width=2)
        d.line((tx, y - 11, tx, y + 11), fill=color, width=4)
    d.text((left + 28, bottom - 38), '留频', font=font(15), fill=muted)
    d.text((sl + 2, bottom - 38), 'PODCAST RECEIVER / 01', font=font(15), fill=muted)
    by = bottom - 108
    for x, color, label in [
        (right - 260, '#e3dfd2', '◀'),
        (right - 186, '#c05a32', 'Ⅱ'),
        (right - 112, '#e3dfd2', '▶'),
    ]:
        d.rounded_rectangle((x, by, x + 60, by + 60), radius=12,
                            fill=shell if flat else color, outline=edge, width=2)
        d.text((x + 18, by + 16), label, font=font(20), fill=ink)
    return img


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    draw(False, False).save(OUT)
    draw(True, False).save(OUT.with_name('xiaomi-rear-media-card-dark.png'))
    draw(False, True).save(OUT.with_name('xiaomi-rear-media-card-flat.png'))
    print('wrote', OUT, 'and dark/flat variants')


if __name__ == '__main__':
    main()
