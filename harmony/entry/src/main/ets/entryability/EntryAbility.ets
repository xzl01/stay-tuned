/* SPDX-License-Identifier: GPL-3.0-only */

import { AbilityConstant, Configuration, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTuned';

/**
 * HarmonyOS entry ability: the whole product is the web bundle running inside
 * ArkWeb, so the ability only owns the window and the initial page.
 */
export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, 'onCreate');
    this.applyCardAction(want);
  }

  /** The card can only reach us by launching the ability; hand the intent on. */
  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.applyCardAction(want);
  }

  /** Light/dark switch while the app is alive: the page re-renders from this. */
  onConfigurationUpdate(newConfig: Configuration): void {
    const dark = newConfig.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
    AppStorage.setOrCreate('systemDark', dark);
  }

  private applyCardAction(want: Want): void {
    const parameters = want.parameters;
    if (!parameters) return;
    const action = String(parameters['stayTunedAction'] ?? '');
    if (action.length > 0) {
      // The page links this through @StorageLink and consumes it once.
      AppStorage.setOrCreate('stayTunedAction', action);
    }
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Edge to edge: the page already pads with env(safe-area-inset-*), so the
    // window hands it the whole screen instead of a status-bar inset one.
    try {
      windowStage.getMainWindowSync().setWindowLayoutFullScreen(true).catch((error: BusinessError) => {
        hilog.warn(DOMAIN, TAG, 'setWindowLayoutFullScreen failed: %{public}d', error.code);
      });
    } catch (error) {
      const failure = error as BusinessError;
      hilog.warn(DOMAIN, TAG, 'main window unavailable: %{public}s', JSON.stringify(failure));
    }

    windowStage.loadContent('pages/Index', (err: BusinessError) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, 'loadContent done');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'onBackground');
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onDestroy');
  }
}
