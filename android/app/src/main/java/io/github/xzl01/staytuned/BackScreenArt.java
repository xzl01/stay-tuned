/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

/**
 * 背屏点阵画面：17 列 × 23 行的灰度帧。
 *
 * 布局刻意保持简单——点阵只有 379 颗灯，中文标题放不下，
 * 所以画的是留频本身的语言：一个播放/暂停符号、一条呼吸的波形、
 * 底部一行进度（直播时是闪烁的点）。
 */
final class BackScreenArt {

    private static final int COLS = BackScreen.COLS;
    private static final int ROWS = BackScreen.ROWS;

    private static final int GLYPH = 235;
    private static final int BAR = 210;
    private static final int BAR_EDGE = 90;
    private static final int TRACK = 45;
    private static final int PROGRESS = 200;

    private BackScreenArt() {
    }

    static int[] frame(long timeMs, boolean playing, boolean live, float progress) {
        int[] frame = new int[BackScreen.CELLS];

        if (playing) {
            triangle(frame);
        } else {
            pauseBars(frame);
        }

        // 波形占据第 8–18 行，从基线向上生长。
        int baseline = 18;
        for (int col = 0; col < COLS; col++) {
            int height = playing ? barHeight(timeMs, col) : 1;
            for (int row = baseline; row > baseline - height && row >= 8; row--) {
                int value = row == baseline - height + 1 ? GLYPH : BAR;
                frame[row * COLS + col] = value;
            }
        }

        if (live) {
            // 直播：底部中间一个呼吸点，两侧短线。
            boolean on = (timeMs / 700) % 2 == 0;
            frame[21 * COLS + 8] = on ? GLYPH : TRACK;
            frame[21 * COLS + 6] = BAR_EDGE;
            frame[21 * COLS + 10] = BAR_EDGE;
        } else {
            int filled = Math.round(Math.max(0f, Math.min(1f, progress)) * (COLS - 1));
            for (int col = 0; col < COLS; col++) {
                frame[21 * COLS + col] = col <= filled ? PROGRESS : TRACK;
            }
        }

        return frame;
    }

    private static void triangle(int[] frame) {
        int[][] cells = {
                {1, 7}, {2, 7}, {2, 8}, {3, 7}, {3, 8}, {3, 9},
                {4, 7}, {4, 8}, {4, 9}, {4, 10},
                {5, 7}, {5, 8}, {5, 9}, {5, 10}, {5, 11},
                {6, 7}, {6, 8}, {6, 9}, {6, 10}, {6, 11}, {6, 12},
        };
        for (int[] cell : cells) {
            frame[cell[0] * COLS + cell[1]] = GLYPH;
        }
    }

    private static void pauseBars(int[] frame) {
        for (int row = 2; row <= 5; row++) {
            for (int col = 6; col <= 7; col++) frame[row * COLS + col] = GLYPH;
            for (int col = 9; col <= 10; col++) frame[row * COLS + col] = GLYPH;
        }
    }

    /** 三条不同频率的正弦叠加，看起来像真实电平而不是随机跳动。 */
    private static int barHeight(long timeMs, int col) {
        double t = timeMs / 1000.0;
        double a = Math.sin(t * 4.1 + col * 0.55);
        double b = Math.sin(t * 8.7 + col * 1.31 + 1.7);
        double c = Math.sin(t * 15.3 + col * 0.23 + 3.1);
        double mixed = (a * 0.52 + b * 0.31 + c * 0.17) * 0.5 + 0.5;
        double envelope = 1.0 - Math.abs(col - COLS / 2.0) / COLS * 0.55;
        return 1 + (int) Math.round(mixed * envelope * 9.0);
    }
}
