#!/usr/bin/env node
/*
 * Vendors the prebuilt sherpa-onnx iOS xcframework into
 * modules/nitro-tts/ios/vendor/ so NitroTts.podspec can link it for the
 * on-device Kokoro engine.
 *
 * k2-fsa publishes the iOS xcframeworks under a dedicated `xcframework`
 * release tag. We use the `ios-static` variant: sherpa-onnx built as a static
 * archive with ONNX Runtime linked in, wrapped in `sherpa-onnx.xcframework`
 * (inner framework `SherpaOnnxC.framework`, module `SherpaOnnxC`, bundled
 * modulemap + `c-api.h`). Static → nothing to embed/sign, no launch crash.
 *
 * Why fetch instead of commit: ~17 MB zip and `expo prebuild` regenerates
 * ios/ every build. Runs on macOS CI before `pod install` and locally before
 * `expo run:ios`. Output dir is gitignored.
 *
 * The Kokoro path is compiled behind `#if canImport(SherpaOnnxC)` — if this
 * step is skipped the app still builds, with Kokoro unavailable.
 *
 * Override the pinned version with SHERPA_ONNX_VERSION=x.y.z (must have an
 * `-ios-static.xcframework.zip` asset on the `xcframework` release:
 * https://github.com/k2-fsa/sherpa-onnx/releases/tag/xcframework).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = process.env.SHERPA_ONNX_VERSION || '1.13.7';
const VENDOR_DIR = path.join(
  __dirname,
  '..',
  'modules',
  'nitro-tts',
  'ios',
  'vendor',
);
const ASSET = `sherpa-onnx-v${VERSION}-ios-static.xcframework.zip`;
const URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/xcframework/${ASSET}`;
/** Stable name the podspec expects, regardless of what the zip calls it. */
const DEST_NAME = 'sherpa-onnx.xcframework';

const log = msg => process.stdout.write(`[fetch-sherpa-onnx] ${msg}\n`);
const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });

function main() {
  if (process.platform !== 'darwin') {
    log(`skipped: iOS-only step, platform is ${process.platform}.`);
    return;
  }
  const dest = path.join(VENDOR_DIR, DEST_NAME);
  if (fs.existsSync(path.join(dest, 'Info.plist'))) {
    log('framework already present — nothing to do.');
    return;
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-onnx-'));
  const zip = path.join(tmp, ASSET);

  log(`downloading ${URL}`);
  run(`curl -L --fail -o "${zip}" "${URL}"`);
  log('extracting');
  run(`unzip -q "${zip}" -d "${tmp}"`);

  const xcf = fs
    .readdirSync(tmp)
    .find(name => name.endsWith('.xcframework'));
  if (!xcf) {
    throw new Error(`no *.xcframework found inside ${ASSET}.`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  run(`cp -R "${path.join(tmp, xcf)}" "${dest}"`);
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`vendored ${DEST_NAME}`);
}

try {
  main();
} catch (err) {
  log(`FAILED: ${err.message}`);
  log('Kokoro will be unavailable in this build; the rest of the app is fine.');
  process.exitCode = process.env.CI ? 1 : 0;
}
