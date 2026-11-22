/* SPDX-License-Identifier: GPL-3.0-only */

import { webview } from '@kit.ArkWeb';
import { picker } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { common, ConfigurationConstant, Want } from '@kit.AbilityKit';
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
  /** Set by EntryAbility when the home-screen card asked for a transport action. */
  @StorageLink('stayTunedAction') @Watch('onCardAction') cardAction: string = '';
  /** Mirrors the OS light/dark mode for the page, which cannot read it itself. */
  @StorageLink('systemDark') @Watch('onSystemDark') systemDark: boolean = false;
  /** Set when the bundled page fails to load, so we can offer a retry. */
  @State loadFailed: boolean = false;
  @State loadErrorDetail: string = '';

  aboutToAppear(): void {
    this.context = getContext(this) as common.UIAbilityContext;
    this.media.setController(this.controller);
    this.files.setContext(this.context);
    this.chrome.setContext(this.context);
    this.chrome.setController(this.controller);
    // Seed the page with the current system mode; the change event updates it.
    this.systemDark = this.isSystemDark(this.context);
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

  onSystemDark(): void {
    this.chrome.applySystemDark(this.systemDark);
  }

  private isSystemDark(context: common.UIAbilityContext): boolean {
    return context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
  }

  onCardAction(): void {
    const action = this.cardAction;
    if (action.length === 0) return;
    // Consume it so the next launch does not replay the command.
    AppStorage.setOrCreate('stayTunedAction', '');
    this.media.sendAction(action);
  }

  /** True for links that should leave the shell (browser, mail, store...). */
  private shouldOpenExternally(url: string): boolean {
    if (url.length === 0) return false;
    if (url.startsWith('resource://') || url.startsWith('about:') || url.startsWith('data:')) {
      return false;
    }
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * Hand a link to the system browser. Android does the same through
   * Capacitor's `launchIntent`, and without it every `target="_blank"` link in
   * the app (release notes, licence, podcast site) is dead in the shell.
   */
  private openExternal(url: string): void {
    const context = this.context;
    if (!context) return;
    const want: Want = {
      action: 'ohos.want.action.viewData',
      entities: ['entity.system.browsable'],
      uri: url,
    };
    context.startAbility(want).catch((error: BusinessError) => {
      hilog.warn(DOMAIN, TAG, 'open external failed: %{public}s', JSON.stringify(error));
    });
  }

  /** Re-enter the bundled page after the renderer was killed. */
  private reloadPage(): void {
    this.media.markNotReady();
    try {
      this.controller.loadUrl('resource://rawfile/www/index.html');
    } catch (error) {
      const failure = error as BusinessError;
      hilog.error(DOMAIN, TAG, 'reload failed: %{public}s', JSON.stringify(failure));
    }
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
    Stack() {
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
        .onErrorReceive((event: OnErrorReceiveEvent) => {
          // Only a failed main frame leaves the user staring at nothing; a
          // missing cover or segment is handled by the page itself.
          if (!event.request.isMainFrame()) return;
          this.loadErrorDetail = event.error.getErrorInfo();
          this.loadFailed = true;
          hilog.warn(DOMAIN, TAG, 'page load failed: %{public}s', this.loadErrorDetail);
        })
        .onPageBegin(() => {
          // A reload (renderer recovery) invalidates the previous page.
          this.media.markNotReady();
        })
        .onPageEnd(() => {
          this.media.markReady();
        })
        .onLoadIntercept((event: OnLoadInterceptEvent) => {
          const url = event.data.getRequestUrl();
          if (this.shouldOpenExternally(url)) {
            this.openExternal(url);
            return true;
          }
          return false;
        })
        .onDownloadStart((event: OnDownloadStartEvent) => {
          // Anything the page tries to download goes to the browser, which owns
          // a real downloader; the blob: exports already use StayTunedFiles.
          if (this.shouldOpenExternally(event.url)) {
            this.openExternal(event.url);
          }
        })
        .onRenderExited(() => {
          // The renderer can be reclaimed while the app sits in the background.
          // Reloading is the difference between "the receiver is back" and a
          // permanently blank window.
          hilog.warn(DOMAIN, TAG, 'renderer exited, reloading');
          this.reloadPage();
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

      if (this.loadFailed) {
        Column({ space: 12 }) {
          Text('留频')
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor('#2E312B')
          Text('页面没有加载成功')
            .fontSize(14)
            .fontColor('#5C6056')
          if (this.loadErrorDetail.length > 0) {
            Text(this.loadErrorDetail)
              .fontSize(12)
              .fontColor('#8A8D80')
              .maxLines(3)
              .textAlign(TextAlign.Center)
          }
          Button('重试')
            .fontSize(14)
            .backgroundColor('#C85235')
            .onClick(() => {
              this.loadFailed = false;
              this.reloadPage();
            })
            .margin({ top: 8 })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#EFECE4')
      }
    }
    .width('100%')
    .height('100%')
  }
}
