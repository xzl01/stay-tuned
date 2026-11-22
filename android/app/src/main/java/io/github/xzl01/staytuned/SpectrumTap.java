/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

/**
 * 播放链路上的频谱取样点。
 *
 * 音频解码后、送进扬声器之前，{@link SpectrumAudioProcessor} 会把 PCM 顺手分析一遍，
 * 结果放在这里；页面每帧来取一次。只共享一个 float 数组，不分配、不加锁。
 */
final class SpectrumTap {

    /** 频段数量，和界面上的 24 根柱子对齐。 */
    static final int BANDS = 24;

    private static final float[] LEVELS = new float[BANDS];
    private static volatile boolean attached;
    private static volatile long lastFrameAtMs;

    private SpectrumTap() {
    }

    static void markAttached() {
        attached = true;
    }

    static boolean isAttached() {
        return attached;
    }

    /** 写入一帧（0–1），供界面读取。 */
    static void publish(float[] levels) {
        synchronized (LEVELS) {
            System.arraycopy(levels, 0, LEVELS, 0, Math.min(levels.length, BANDS));
        }
        lastFrameAtMs = android.os.SystemClock.elapsedRealtime();
    }

    /** 最近一帧的时间戳；直播流断流时可以据此判断数据是否还是新的。 */
    static long lastFrameAtMs() {
        return lastFrameAtMs;
    }

    static void clear() {
        synchronized (LEVELS) {
            java.util.Arrays.fill(LEVELS, 0f);
        }
    }

    /** 当前频段电平的拷贝；没有音频流过时返回 null。 */
    static float[] read() {
        if (!attached) return null;
        float[] copy = new float[BANDS];
        synchronized (LEVELS) {
            System.arraycopy(LEVELS, 0, copy, 0, BANDS);
        }
        return copy;
    }
}
