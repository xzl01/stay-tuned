/* SPDX-License-Identifier: GPL-3.0-only */

import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { StayTunedHttp } from '../common/HttpBridge';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTuned';

/**
 * The player is the existing Vite bundle, shipped in `resources/rawfile/www`
 * by `npm run harmony:sync`. ArkWeb renders it full screen; the ArkTS proxy
 * below gives the page the same CORS-free network access the Android build
 * gets from CapacitorHttp.
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: StayTunedHttp = new StayTunedHttp();

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
            // Registered before the page loads, so `window.StayTunedHttp` is
            // available to the first script the bundle runs.
            this.controller.registerJavaScriptProxy(this.bridge, 'StayTunedHttp', [], ['request']);
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
