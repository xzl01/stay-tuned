/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * HarmonyOS file bridge.
 *
 * Exports (subscription backups) are produced as blobs and downloaded with an
 * anchor, which ArkWeb cannot route to a downloader. When the ArkTS bridge is
 * present the file is written through the system save picker instead.
 */

interface HarmonyFilesBridge {
  saveText(fileName: string, text: string): Promise<string>;
}

declare global {
  interface Window {
    StayTunedFiles?: HarmonyFilesBridge;
  }
}

export function isHarmonyFilesAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.StayTunedFiles?.saveText === 'function';
}

/** Returns the saved path, or an empty string when the user cancelled. */
export async function saveTextWithPicker(fileName: string, text: string): Promise<string> {
  const bridge = typeof window === 'undefined' ? undefined : window.StayTunedFiles;
  if (!bridge) throw new Error('鸿蒙文件桥未注册。');
  const saved = await bridge.saveText(fileName, text);
  return typeof saved === 'string' ? saved : '';
}
