/* SPDX-License-Identifier: GPL-3.0-only */

import { webview } from '@kit.ArkWeb';

/**
 * The player is the existing Vite bundle, shipped in `resources/rawfile/www`
 * by `npm run harmony:sync`. ArkWeb renders it full screen; every platform
 * capability the page needs is optional, so a plain shell is enough to start.
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();

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
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#EFECE4')
  }
}
