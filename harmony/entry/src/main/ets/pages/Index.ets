/* SPDX-License-Identifier: GPL-3.0-only */

import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { StayTunedHttp } from '../common/HttpBridge';
import { MediaHost } from '../common/MediaHost';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTuned';

/**
 * The player is the existing Vite bundle, shipped in `resources/rawfile/www`
 * by `npm run harmony:sync`. ArkWeb renders it full screen; the two ArkTS
 * proxies give it what a WebView cannot provide on its own: CORS-free network
 * access (`StayTunedHttp`) and background playback plus a media session
 * (`StayTunedMedia`).
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: StayTunedHttp = new StayTunedHttp();
  private media: MediaHost = new MediaHost();

  aboutToAppear(): void {
    const context = getContext(this) as common.UIAbilityContext;
    this.media.setController(this.controller);
    this.media.init(context).catch((error: BusinessError) => {
      hilog.error(DOMAIN, TAG, 'media host init failed: %{public}s', JSON.stringify(error));
    });
  }

  aboutToDisappear(): void {
    this.media.teardown().catch(() => undefined);
  }

  build() {
    Column() {
      Web({ src: $rawfile('www/index.html'), controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .onlineImageAccess(true)
        .mixedMode(MixedMode.All)
        .zoomAccess(false)
        .horizontalScrollBarAccess(false)
        .verticalScrollBarAccess(false)
        .darkMode(WebDarkMode.Auto)
        .onControllerAttached(() => {
          try {
            // Registered before the page loads, so both globals exist for the
            // first script the bundle runs.
            this.controller.registerJavaScriptProxy(this.bridge, 'StayTunedHttp', [], ['request']);
            this.controller.registerJavaScriptProxy(this.media, 'StayTunedMedia', ['update']);
          } catch (error) {
            const failure = error as BusinessError;
            hilog.error(DOMAIN, TAG, 'registerJavaScriptProxy failed: %{public}s', JSON.stringify(failure));
          }
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#EFECE4')
  }
}
