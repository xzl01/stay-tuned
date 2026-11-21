/* SPDX-License-Identifier: GPL-3.0-only */

import { avSession } from '@kit.AVSessionKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { common, wantAgent } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { webview } from '@kit.ArkWeb';
import { http } from '@kit.NetworkKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTunedMedia';
const SESSION_TAG: string = 'stay-tuned';
/** Lock-screen covers are drawn small; decoding megabytes for them is waste. */
const ARTWORK_PX: number = 512;
const ARTWORK_MAX_BYTES: number = 8 * 1024 * 1024;

/** What the page reports about the item it is playing. */
interface MediaStatePayload {
  title?: string;
  artist?: string;
  playing?: boolean;
  position?: number;
  duration?: number;
  speed?: number;
  /** Remote https URL or a `data:image/...;base64` string; empty when unknown. */
  artwork?: string;
}

function finiteOr(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Keeps ArkWeb audio alive in the background and exposes it to the system:
 *
 *   - a long-running task (AUDIO_PLAYBACK) so the WebView is not frozen;
 *   - an AVSession so the lock screen, the control centre and Bluetooth headsets
 *     can see the item and drive it.
 *
 * Audio itself still comes from the page's <audio> element — ArkTS only owns the
 * background task and the media session.
 */
export class MediaHost {
  private context?: common.UIAbilityContext;
  private controller?: webview.WebviewController;
  private session?: avSession.AVSession;
  private running: boolean = false;
  private starting: boolean = false;
  private lastPlaying: boolean = false;
  private lastTitle: string = '';
  private lastArtist: string = '';
  private lastDuration: number = 0;
  private artworkSource: string = '';
  private artwork?: image.PixelMap;

  setController(controller: webview.WebviewController): void {
    this.controller = controller;
  }

  async init(context: common.UIAbilityContext): Promise<void> {
    this.context = context;
    try {
      const session = await avSession.createAVSession(context, SESSION_TAG, 'audio');
      this.session = session;
      session.on('play', () => this.command('play'));
      session.on('pause', () => this.command('pause'));
      session.on('stop', () => this.command('pause'));
      session.on('playNext', () => this.command('next'));
      session.on('playPrevious', () => this.command('prev'));
      session.on('seek', (time: number) => this.command('seek', Math.max(0, time) / 1000));
      await session.activate();
      hilog.info(DOMAIN, TAG, 'AVSession ready');
    } catch (error) {
      const failure = error as BusinessError;
      hilog.error(DOMAIN, TAG, 'AVSession failed: %{public}s', JSON.stringify(failure));
    }
  }

  /**
   * Called from the page whenever the item, state or position changes. The page
   * throttles, so this stays cheap.
   */
  update(stateJson: string): void {
    let payload: MediaStatePayload = {};
    try {
      payload = JSON.parse(stateJson) as MediaStatePayload;
    } catch (error) {
      return;
    }

    const playing = payload.playing === true;
    this.applyBackground(playing);
    if (!this.session) return;

    const title = payload.title ?? '';
    const artist = payload.artist ?? '';
    if (title.length > 0) {
      this.lastTitle = title;
      this.lastArtist = artist;
      this.lastDuration = finiteOr(payload.duration, 0);
      this.applyMetadata();
      const artworkSource = payload.artwork ?? '';
      if (artworkSource !== this.artworkSource) {
        // Decoding is async; metadata is refreshed once the cover is ready.
        this.loadArtwork(artworkSource).catch(() => undefined);
      }
    }

    const elapsed = finiteOr(payload.position, 0) * 1000;
    this.session.setAVPlaybackState({
      state: playing
        ? avSession.PlaybackState.PLAYBACK_STATE_PLAY
        : avSession.PlaybackState.PLAYBACK_STATE_PAUSE,
      speed: finiteOr(payload.speed, 1),
      position: { elapsedTime: elapsed, updateTime: Date.now() },
    }).catch((error: BusinessError) => {
      hilog.warn(DOMAIN, TAG, 'setAVPlaybackState failed: %{public}d', error.code);
    });
  }

  /** Re-publish everything the lock screen shows, including the cover. */
  private applyMetadata(): void {
    const session = this.session;
    if (!session) return;
    const metadata: avSession.AVMetadata = {
      assetId: SESSION_TAG,
      title: this.lastTitle,
      artist: this.lastArtist,
      album: '留频',
      duration: this.lastDuration * 1000,
    };
    if (this.artwork) {
      // AVMetadata calls the cover `mediaImage`; it accepts a PixelMap or a URI.
      metadata.mediaImage = this.artwork;
    }
    session.setAVMetadata(metadata).catch((error: BusinessError) => {
      hilog.warn(DOMAIN, TAG, 'setAVMetadata failed: %{public}d', error.code);
    });
  }

  private async loadArtwork(source: string): Promise<void> {
    this.artworkSource = source;
    if (source.length === 0) {
      this.artwork = undefined;
      this.applyMetadata();
      return;
    }
    try {
      const buffer = await this.fetchArtwork(source);
      if (!buffer || this.artworkSource !== source) return;
      const imageSource = image.createImageSource(buffer);
      if (!imageSource) return;
      const pixelMap = await imageSource.createPixelMap({
        desiredSize: { width: ARTWORK_PX, height: ARTWORK_PX },
      });
      await imageSource.release();
      // The user may have skipped to another item while the image decoded.
      if (this.artworkSource !== source) {
        await pixelMap.release();
        return;
      }
      this.artwork = pixelMap;
      this.applyMetadata();
    } catch (error) {
      const failure = error as BusinessError;
      hilog.warn(DOMAIN, TAG, 'artwork decode failed: %{public}s', JSON.stringify(failure));
    }
  }

  /** Accepts a remote URL or an inline `data:` image (uploaded station covers). */
  private async fetchArtwork(source: string): Promise<ArrayBuffer | undefined> {
    if (source.startsWith('data:')) {
      const comma = source.indexOf(',');
      if (comma < 0) return undefined;
      if (!source.slice(5, comma).includes('base64')) return undefined;
      const helper = new util.Base64Helper();
      const bytes = helper.decodeSync(source.slice(comma + 1));
      return bytes.buffer as ArrayBuffer;
    }
    if (!source.startsWith('http')) return undefined;

    const request = http.createHttp();
    try {
      const response = await request.request(source, {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        connectTimeout: 8000,
        readTimeout: 8000,
        usingCache: true,
      });
      if (response.responseCode !== 200) return undefined;
      const data = response.result;
      if (!(data instanceof ArrayBuffer)) return undefined;
      if (data.byteLength > ARTWORK_MAX_BYTES) return undefined;
      return data;
    } catch (error) {
      return undefined;
    } finally {
      request.destroy();
    }
  }

  /** Stop the long-running task when the app leaves the playback flow. */
  async teardown(): Promise<void> {
    await this.stopBackground();
    if (this.artwork) {
      await this.artwork.release();
      this.artwork = undefined;
    }
    const session = this.session;
    this.session = undefined;
    if (!session) return;
    try {
      await session.deactivate();
      await session.destroy();
    } catch (error) {
      // Losing the session on teardown is harmless.
    }
  }

  private applyBackground(playing: boolean): void {
    if (playing === this.lastPlaying) return;
    this.lastPlaying = playing;
    if (playing) {
      this.startBackground();
    } else {
      this.stopBackground();
    }
  }

  private async startBackground(): Promise<void> {
    if (this.running || this.starting || !this.context) return;
    this.starting = true;
    try {
      const info: wantAgent.WantAgentInfo = {
        wants: [
          {
            bundleName: this.context.abilityInfo.bundleName,
            abilityName: this.context.abilityInfo.name,
          },
        ],
        actionType: wantAgent.OperationType.START_ABILITY,
        requestCode: 0,
        actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG],
      };
      const agent = await wantAgent.getWantAgent(info);
      await backgroundTaskManager.startBackgroundRunning(
        this.context,
        backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK,
        agent,
      );
      this.running = true;
      hilog.info(DOMAIN, TAG, 'background task started');
    } catch (error) {
      const failure = error as BusinessError;
      hilog.error(DOMAIN, TAG, 'startBackgroundRunning failed: %{public}s', JSON.stringify(failure));
    } finally {
      this.starting = false;
    }
  }

  private async stopBackground(): Promise<void> {
    if (!this.running || !this.context) return;
    this.running = false;
    try {
      await backgroundTaskManager.stopBackgroundRunning(this.context);
      hilog.info(DOMAIN, TAG, 'background task stopped');
    } catch (error) {
      const failure = error as BusinessError;
      hilog.warn(DOMAIN, TAG, 'stopBackgroundRunning failed: %{public}s', JSON.stringify(failure));
    }
  }

  /** Push a transport command into the page, which owns the actual player. */
  private command(action: string, value?: number): void {
    const controller = this.controller;
    if (!controller) return;
    const argument = value === undefined ? '' : ', ' + value;
    const script = `window.__stayTunedMediaCommand && window.__stayTunedMediaCommand('${action}'${argument})`;
    controller.runJavaScript(script).catch((error: BusinessError) => {
      hilog.warn(DOMAIN, TAG, 'runJavaScript failed: %{public}d', error.code);
    });
  }
}
