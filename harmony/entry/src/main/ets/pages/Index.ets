/* SPDX-License-Identifier: GPL-3.0-only */

import { webview } from '@kit.ArkWeb';
import { picker } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { StayTunedHttp } from '../common/HttpBridge';
import { MediaHost } from '../common/MediaHost';
import { FilesHost } from '../common/FilesHost';
import { HapticsHost } from '../common/HapticsHost';
import { ChromeHost } from '../common/ChromeHost';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTuned';

/**
 * The player is the existing Vite bundle, shipped in `resources/rawfile/www`
 * by `npm run harmony:sync`. ArkWeb renders it full screen; the ArkTS side adds
 * what a WebView cannot do on its own:
 *
 *   StayTunedHttp   CORS-free network access for the bundled parsers
 *   StayTunedMedia  background task + AVSession for lock screen control
 *   StayTunedFiles  writing exports through the system save picker
 *   StayTunedHaptics  fader / button cues on the linear motor
 *   onShowFileSelector  `<input type="file">` (M3U import, backup restore, covers)
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: StayTunedHttp = new StayTunedHttp();
  private media: MediaHost = new MediaHost();
  private files: FilesHost = new FilesHost();
  private haptics: HapticsHost = new HapticsHost();
  private chrome: ChromeHost = new ChromeHost();
  private context?: common.UIAbilityContext;

  aboutToAppear(): void {
    this.context = getContext(this) as common.UIAbilityContext;
    this.media.setController(this.controller);
    this.files.setContext(this.context);
    this.chrome.setContext(this.context);
    this.media.init(this.context).catch((error: BusinessError) => {
      hilog.error(DOMAIN, TAG, 'media host init failed: %{public}s', JSON.stringify(error));
    });
  }

  aboutToDisappear(): void {
    this.media.teardown().catch(() => undefined);
  }

  /** Map the web `accept` attribute onto document-picker suffix filters. */
  private suffixFilters(acceptTypes: string[]): string[] {
    const accept = (acceptTypes ?? []).join(',').toLowerCase();
    if (accept.includes('image/')) {
      return ['图片: .png, .jpg, .jpeg, .webp, .gif, .svg'];
    }
    if (accept.includes('json')) {
      return ['备份文件: .json'];
    }
    if (accept.includes('mpegurl') || accept.includes('.m3u') || accept.includes('text/plain')) {
      return ['播放列表: .m3u, .m3u8, .txt'];
    }
    return [];
  }

  private openFilePicker(event: OnShowFileSelectorEvent): void {
    const context = this.context;
    if (!context) {
      event.result.handleFileList([]);
      return;
    }
    const options = new picker.DocumentSelectOptions();
    options.maxSelectNumber = 1;
    const acceptTypes: string[] = event.fileSelector ? event.fileSelector.getAcceptType() : [];
    const filters = this.suffixFilters(acceptTypes);
    if (filters.length > 0) {
      options.fileSuffixFilters = filters;
    }

    const documentPicker = new picker.DocumentViewPicker(context);
    documentPicker.select(options)
      .then((uris: string[]) => {
        // An empty list simply means the user backed out.
        event.result.handleFileList(uris ?? []);
      })
      .catch((error: BusinessError) => {
        hilog.error(DOMAIN, TAG, 'file picker failed: %{public}s', JSON.stringify(error));
        event.result.handleFileList([]);
      });
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
        .onShowFileSelector((event: OnShowFileSelectorEvent) => {
          this.openFilePicker(event);
          // Returning true means ArkWeb waits for handleFileList().
          return true;
        })
        .onControllerAttached(() => {
          try {
            // Registered before the page loads, so every global exists for the
            // first script the bundle runs.
            this.controller.registerJavaScriptProxy(this.bridge, 'StayTunedHttp', [], ['request']);
            this.controller.registerJavaScriptProxy(this.media, 'StayTunedMedia', ['update']);
            this.controller.registerJavaScriptProxy(this.files, 'StayTunedFiles', [], ['saveText']);
            this.controller.registerJavaScriptProxy(this.haptics, 'StayTunedHaptics', ['pulse']);
            this.controller.registerJavaScriptProxy(this.chrome, 'StayTunedChrome', [], ['setBars']);
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
