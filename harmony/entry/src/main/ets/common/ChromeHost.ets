/* SPDX-License-Identifier: GPL-3.0-only */

import { window } from '@kit.ArkUI';
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

  setContext(context: common.UIAbilityContext): void {
    this.context = context;
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
