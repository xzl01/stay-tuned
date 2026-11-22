/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

/**
 * 背屏点阵画面：17 列 × 23 行的灰度帧。
 *
 * 只画频谱——播放状态、进度这些交给主屏和锁屏卡片，点阵屏 379 颗灯留给
 * 声音本身最合适：低频在左、高频在右，柱子从底部长上来。
 */
final class BackScreenArt {

    private static final int COLS = BackScreen.COLS;
    private static final int ROWS = BackScreen.ROWS;

    private static final int BAR = 210;
    private static final int BAR_PEAK = 235;

    /** 上一帧的柱高，用来做快升慢落，避免点阵跳动太生硬。 */
    private static final float[] LEVELS = new float[COLS];

    private BackScreenArt() {
    }

    /**
     * @param bands 真实频段（{@link SpectrumAudioProcessor} 采样，可能为 null）：
     *              有数据就画频谱，没有（暂停、断流）就整屏熄灭。
     */
    static int[] frame(boolean playing, float[] bands) {
        int[] frame = new int[BackScreen.CELLS];
        int floor = ROWS - 1;
        int maxHeight = ROWS;

        for (int col = 0; col < COLS; col++) {
            float target = 0f;
            if (playing && bands != null && bands.length > 1) {
                float at = (col / (float) (COLS - 1)) * (bands.length - 1);
                int low = (int) Math.floor(at);
                int high = Math.min(bands.length - 1, low + 1);
                float mix = at - low;
                target = bands[low] * (1 - mix) + bands[high] * mix;
                // 点阵只有 23 行，小幅提升弱信号，让安静的段落也有形。
                target = (float) Math.pow(Math.max(0f, Math.min(1f, target)), 0.65f);
            }
            float previous = LEVELS[col];
            float next = target > previous
                    ? previous + (target - previous) * 0.6f
                    : previous + (target - previous) * 0.3f;
            LEVELS[col] = next;
            int height = Math.round(next * maxHeight);
            for (int row = floor; row > floor - height && row >= 0; row--) {
                frame[row * COLS + col] = row == floor - height + 1 ? BAR_PEAK : BAR;
            }
        }

        return frame;
    }
}
