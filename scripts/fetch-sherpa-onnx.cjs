#!/usr/bin/env node
/*
 * Vendors the prebuilt sherpa-onnx + onnxruntime iOS xcframeworks into
 * modules/nitro-tts/ios/vendor/ so NitroTts.podspec can link them for the
 * on-device Kokoro engine.
 *
 * Why a fetch step instead of committing the binaries: they are ~100 MB, and
 * `expo prebuild` regenerates ios/ every build so they can't live there. This
 * runs on macOS CI (Codemagic) right before `pod install`, and locally before
 * `expo run:ios`. The output dir is gitignored.
 *
 * The whole Kokoro path is compiled behind `#if canImport(CSherpaOnnx)` — if
 * this step is skipped or the frameworks are absent, the app still builds and
 * ships with Kokoro simply unavailable.
 *
 * Pinned release: https://github.com/k2-fsa/sherpa-onnx/releases
 * Override with SHERPA_ONNX_VERSION=x.y.z.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = process.env.SHERPA_ONNX_VERSION || '1.12.14';
const VENDOR_DIR = path.join(
  __dirname,
  '..',
  'modules',
  'nitro-tts',
  'ios',
  'vendor',
);
const REQUIRED = ['sherpa-onnx.xcframework', 'onnxruntime.xcframework'];

const log = msg => process.stdout.write(`[fetch-sherpa-onnx] ${msg}\n`);

function alreadyVendored() {
  return REQUIRED.every(name => fs.existsSync(path.join(VENDOR_DIR, name)));
}

function run(cmd, cwd) {
  execSync(cmd, { stdio: 'inherit', cwd });
}

function main() {
  if (process.platform !== 'darwin') {
    log(`skipped: iOS-only step, platform is ${process.platform}.`);
    return;
  }
  if (alreadyVendored()) {
    log('frameworks already present — nothing to do.');
    return;
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-onnx-'));
  const archive = path.join(tmp, 'sherpa-onnx-ios.tar.bz2');
  const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VERSION}/sherpa-onnx-v${VERSION}-ios.tar.bz2`;

  log(`downloading ${url}`);
  run(`curl -L --fail -o "${archive}" "${url}"`);
  log('extracting');
  run(`tar xf "${archive}"`, tmp);

  // The archive lays the frameworks out under build-ios/ and ios-onnxruntime/.
  const found = {};
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (REQUIRED.includes(entry.name)) {
          found[entry.name] = full;
        } else {
          walk(full);
        }
      }
    }
  };
  walk(tmp);

  for (const name of REQUIRED) {
    if (!found[name]) {
      throw new Error(
        `${name} not found inside the sherpa-onnx v${VERSION} iOS archive.`,
      );
    }
    const dest = path.join(VENDOR_DIR, name);
    fs.rmSync(dest, { recursive: true, force: true });
    run(`cp -R "${found[name]}" "${dest}"`);
    log(`vendored ${name}`);
  }

  // sherpa-onnx.xcframework ships c-api.h but no clang module map; add one per
  // slice so `import CSherpaOnnx` resolves from Swift.
  writeModuleMaps(path.join(VENDOR_DIR, 'sherpa-onnx.xcframework'));

  fs.rmSync(tmp, { recursive: true, force: true });
  log('done.');
}

function writeModuleMaps(xcframeworkDir) {
  if (!fs.existsSync(xcframeworkDir)) return;
  const moduleMap =
    'module CSherpaOnnx {\n' +
    '  header "c-api.h"\n' +
    '  export *\n' +
    '}\n';
  for (const slice of fs.readdirSync(xcframeworkDir)) {
    const headers = path.join(xcframeworkDir, slice, 'Headers');
    if (fs.existsSync(headers) && fs.statSync(headers).isDirectory()) {
      fs.writeFileSync(path.join(headers, 'module.modulemap'), moduleMap);
    }
  }
}

try {
  main();
} catch (err) {
  log(`FAILED: ${err.message}`);
  log(
    'Kokoro will be unavailable in this build; the rest of the app is unaffected.',
  );
  process.exitCode = process.env.CI ? 1 : 0;
}
