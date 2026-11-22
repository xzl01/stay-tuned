/* SPDX-License-Identifier: GPL-3.0-only */

import { window } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTunedChrome';

interface BarsPayload {
  dark?: boolean;
}

/**
 * Status / navigation bar colours follow the app's own light or dark choice.
 *
 * The window paints edge to edge (see EntryAbility) so the page can pad with
 * `env(safe-area-inset-*)` exactly like it does on Android; that leaves the
 * system bar icons drawn over the page, which only works if their colour is
 * flipped with the theme.
 */
export class ChromeHost {
  private context?: common.UIAbilityContext;
  private controller?: webview.WebviewController;

  setContext(context: common.UIAbilityContext): void {
    this.context = context;
  }

  setController(controller: webview.WebviewController): void {
    this.controller = controller;
  }

  /**
   * ArkWeb does not reliably report `prefers-color-scheme`, so the system's
   * light/dark choice is pushed into the page instead. The app treats it as the
   * "follow the system" signal and re-renders when it changes.
   */
  applySystemDark(dark: boolean): void {
    const controller = this.controller;
    if (!controller) return;
    const script =
      'window.__stayTunedSystemDark = ' + (dark ? 'true' : 'false') + ';' +
      'window.dispatchEvent(new Event(\'staytuned:systemdark\'));';
    controller.runJavaScript(script).catch((error: BusinessError) => {
      hilog.warn(DOMAIN, TAG, 'system colour push failed: %{public}d', error.code);
    });
  }

  async setBars(payloadJson: string): Promise<void> {
    if (!this.context) return;
    let payload: BarsPayload = {};
    try {
      payload = JSON.parse(payloadJson) as BarsPayload;
    } catch (error) {
      return;
    }

    const dark = payload.dark === true;
    try {
      const mainWindow = await window.getLastWindow(this.context);
      await mainWindow.setWindowSystemBarProperties({
        statusBarContentColor: dark ? '#F2EFE7' : '#2E312B',
        navigationBarContentColor: dark ? '#F2EFE7' : '#2E312B',
        isStatusBarLightIcon: dark,
        isNavigationBarLightIcon: dark,
      });
    } catch (error) {
      const failure = error as BusinessError;
      hilog.warn(DOMAIN, TAG, 'setWindowSystemBarProperties failed: %{public}s', JSON.stringify(failure));
    }
  }
}
