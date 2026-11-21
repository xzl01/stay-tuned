/* SPDX-License-Identifier: GPL-3.0-only */

import { fileIo, picker } from '@kit.CoreFileKit';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'StayTunedFiles';

/**
 * The web build downloads exports with a blob URL, which ArkWeb cannot hand to
 * a downloader. This bridge writes the file through the system save picker
 * instead, so a subscription backup ends up wherever the user chooses.
 */
export class FilesHost {
  private context?: common.UIAbilityContext;

  setContext(context: common.UIAbilityContext): void {
    this.context = context;
  }

  /** Returns the saved uri, or an empty string when the picker was dismissed. */
  async saveText(fileName: string, text: string): Promise<string> {
    if (!this.context) return '';
    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [fileName];
      const documentPicker = new picker.DocumentViewPicker(this.context);
      const uris = await documentPicker.save(options);
      if (!uris || uris.length === 0) return '';

      const file = fileIo.openSync(uris[0], fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC);
      try {
        fileIo.writeSync(file.fd, text);
      } finally {
        fileIo.closeSync(file);
      }
      return uris[0];
    } catch (error) {
      const failure = error as BusinessError;
      hilog.error(DOMAIN, TAG, 'saveText failed: %{public}s', JSON.stringify(failure));
      throw new Error(failure.message ?? '保存文件失败');
    }
  }
}
