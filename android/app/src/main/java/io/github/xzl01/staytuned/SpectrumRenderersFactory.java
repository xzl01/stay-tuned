/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Context;

import androidx.annotation.Nullable;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.audio.DefaultAudioSink;

/**
 * 把 {@link SpectrumAudioProcessor} 插进 ExoPlayer 的音频管线。
 *
 * 只有走这一层，拿到的才是真正正在播放的 PCM；页面里的 Web Audio 在安卓上读不到
 * ExoPlayer 的输出，而 Visualizer 需要录音权限。
 */
@UnstableApi
public final class SpectrumRenderersFactory extends DefaultRenderersFactory {

    public SpectrumRenderersFactory(Context context) {
        super(context);
    }

    @Override
    protected AudioSink buildAudioSink(
            Context context, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
        return new DefaultAudioSink.Builder(context)
                .setAudioProcessors(new AudioProcessor[] {new SpectrumAudioProcessor()})
                .build();
    }
}
