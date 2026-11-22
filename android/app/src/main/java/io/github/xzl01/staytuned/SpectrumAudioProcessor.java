/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.AudioProcessor.AudioFormat;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;

/**
 * 在音频管线上顺手取一份 PCM，做一次 1024 点 FFT，把结果折成 24 个频段。
 *
 * 为什么要走 AudioProcessor：ExoPlayer 的音频不经过 Web Audio，页面里的
 * `AnalyserNode` 在安卓上永远读不到数据；而 `Visualizer` 需要录音权限。
 * 在解码后、播放前取样是唯一既真实又不用额外权限的办法。
 *
 * 这个处理器是「旁路」的：输入原样输出，只在拷贝时分析。
 */
@UnstableApi
public final class SpectrumAudioProcessor extends BaseAudioProcessor {

    private static final int FFT_SIZE = 1024;
    private static final int BANDS = SpectrumTap.BANDS;
    private static final float SMOOTH_UP = 0.55f;
    private static final float SMOOTH_DOWN = 0.85f;

    private final float[] window = new float[FFT_SIZE];
    private final float[] samples = new float[FFT_SIZE];
    private final float[] real = new float[FFT_SIZE];
    private final float[] imag = new float[FFT_SIZE];
    private final float[] bands = new float[BANDS];
    private final int[] bandEdges = new int[BANDS + 1];
    private int sampleCount;
    private boolean analysable;
    private boolean loggedConfigure;
    private boolean loggedFrame;

    public SpectrumAudioProcessor() {
        for (int i = 0; i < FFT_SIZE; i++) {
            window[i] = (float) (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
        }
        SpectrumTap.markAttached();
    }

    @Override
    protected AudioFormat onConfigure(AudioFormat inputAudioFormat) {
        analysable = inputAudioFormat.encoding == C.ENCODING_PCM_16BIT;
        sampleCount = 0;
        computeBandEdges(inputAudioFormat.sampleRate / 2f);
        if (!loggedConfigure) {
            loggedConfigure = true;
            android.util.Log.i("StayTuned", "spectrum: configure encoding="
                    + inputAudioFormat.encoding + " rate=" + inputAudioFormat.sampleRate
                    + " analysable=" + analysable);
        }
        return inputAudioFormat;
    }

    /** 把 30Hz–16kHz 按对数切 24 段，低频段更窄，符合听感。 */
    private void computeBandEdges(float nyquist) {
        double low = 30;
        double high = Math.min(nyquist, 16000);
        for (int i = 0; i <= BANDS; i++) {
            double f = low * Math.pow(high / low, i / (double) BANDS);
            int bin = (int) Math.round(f / (nyquist * 2f / FFT_SIZE));
            bandEdges[i] = Math.max(1, Math.min(FFT_SIZE / 2 - 1, bin));
        }
    }

    @Override
    public void queueInput(ByteBuffer inputBuffer) {
        int remaining = inputBuffer.remaining();
        if (remaining == 0) return;
        if (analysable) {
            // 只读副本：读它不会移动真正的输入游标，输出稍后按字节原样搬运。
            ShortBuffer analysis = inputBuffer.duplicate().order(ByteOrder.nativeOrder()).asShortBuffer();
            int frames = analysis.remaining();
            for (int i = 0; i < frames; i++) feed(analysis.get() / 32768f);
        }
        ByteBuffer out = replaceOutputBuffer(remaining);
        out.put(inputBuffer);
        out.flip();
    }

    private void feed(float value) {
        samples[sampleCount++] = value;
        if (sampleCount < FFT_SIZE) return;
        sampleCount = 0;
        transform();
    }

    private void transform() {
        for (int i = 0; i < FFT_SIZE; i++) {
            real[i] = samples[i] * window[i];
            imag[i] = 0f;
        }
        fft();
        for (int band = 0; band < BANDS; band++) {
            int from = bandEdges[band];
            int to = Math.max(from + 1, bandEdges[band + 1]);
            float peak = 0f;
            for (int bin = from; bin < to; bin++) {
                float magnitude = (float) Math.hypot(real[bin], imag[bin]);
                if (magnitude > peak) peak = magnitude;
            }
            // 先折算成相对满幅的振幅，再按 -60…0 dB 映射到 0–1。
            // 之前直接 log10(1 + peak*12) 对真实音频几乎必然饱和，柱子会全顶格。
            float amplitude = peak / (FFT_SIZE * 0.5f);
            float db = 20f * (float) Math.log10(Math.max(amplitude, 1e-5f));
            float level = Math.max(0f, Math.min(1f, (db + 60f) / 60f));
            float previous = bands[band];
            bands[band] = level > previous
                    ? previous + (level - previous) * SMOOTH_UP
                    : previous + (level - previous) * SMOOTH_DOWN;
        }
        SpectrumTap.publish(bands);
        if (!loggedFrame) {
            loggedFrame = true;
            android.util.Log.i("StayTuned", "spectrum: first frame bands="
                    + java.util.Arrays.toString(bands));
        }
    }

    /** 原地 radix-2 FFT。 */
    private void fft() {
        int n = FFT_SIZE;
        for (int i = 1, j = 0; i < n; i++) {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                float tr = real[i]; real[i] = real[j]; real[j] = tr;
                float ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
            }
        }
        for (int len = 2; len <= n; len <<= 1) {
            double angle = -2 * Math.PI / len;
            float wRe = (float) Math.cos(angle);
            float wIm = (float) Math.sin(angle);
            for (int i = 0; i < n; i += len) {
                float curRe = 1f;
                float curIm = 0f;
                for (int j = 0; j < len / 2; j++) {
                    int a = i + j;
                    int b = i + j + len / 2;
                    float xRe = real[b] * curRe - imag[b] * curIm;
                    float xIm = real[b] * curIm + imag[b] * curRe;
                    real[b] = real[a] - xRe;
                    imag[b] = imag[a] - xIm;
                    real[a] += xRe;
                    imag[a] += xIm;
                    float nextRe = curRe * wRe - curIm * wIm;
                    curIm = curRe * wIm + curIm * wRe;
                    curRe = nextRe;
                }
            }
        }
    }

    /** 给外部读一帧；没有音频时返回 null。 */
    @Nullable
    static float[] snapshot() {
        return SpectrumTap.read();
    }
}
