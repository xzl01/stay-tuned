/* SPDX-License-Identifier: GPL-3.0-only */

// electron-builder v26 does not ad-hoc sign when no certificate is present.
// Local macOS arm64/universal builds need a valid ad-hoc signature to launch.
// CI passes a real CSC_LINK identity, so this hook leaves signed builds alone.
const { execFileSync } = require('node:child_process');

module.exports = async function afterSign(context) {
  if (process.platform !== 'darwin' || process.env.STAY_TUNED_ADHOC_SIGN !== '1') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME || process.env.CSC_KEY_PASSWORD) return;
  const appPath = context.appOutDir + '/' + context.packager.appInfo.productFilename + '.app';
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log('[stay-tuned] applied ad-hoc signature to ' + appPath);
};
