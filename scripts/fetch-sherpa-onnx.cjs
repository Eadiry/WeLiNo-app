#!/usr/bin/env node
/*
 * Vendors the prebuilt sherpa-onnx iOS xcframework into
 * modules/nitro-tts/ios/vendor/ so NitroTts.podspec can link it for the
 * on-device Kokoro engine.
 *
 * k2-fsa publishes the iOS xcframeworks under a dedicated `xcframework`
 * release tag with three variants. We use `ios-shared-onnxruntime-static`:
 * sherpa-onnx as a *dynamic* `sherpa-onnx.xcframework` with ONNX Runtime
 * statically linked *inside* it — one self-contained framework, nothing else
 * to link. (The `ios-static` variant does NOT bundle ONNX Runtime, so it left
 * `_OrtGetApiBase` & friends undefined at Ld — build #31.) The inner framework
 * is `sherpa-onnx.framework`; its bundled modulemap names the Clang module
 * `SherpaOnnxC`, which is what `KokoroSpeechEngine.swift` imports.
 *
 * Being a dynamic framework it needs an embed + code-sign phase, which
 * CocoaPods adds automatically for a `vendored_frameworks` entry — no manual
 * xcconfig required.
 *
 * Why fetch instead of commit: large zip and `expo prebuild` regenerates
 * ios/ every build. Runs on macOS CI before `pod install` and locally before
 * `expo run:ios`. Output dir is gitignored.
 *
 * The Kokoro path is compiled behind `#if canImport(SherpaOnnxC)` — if this
 * step is skipped the app still builds, with Kokoro unavailable.
 *
 * Override the pinned version with SHERPA_ONNX_VERSION=x.y.z (must have an
 * `-ios-shared-onnxruntime-static.xcframework.zip` asset on the `xcframework`
 * release: https://github.com/k2-fsa/sherpa-onnx/releases/tag/xcframework).
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
const ASSET = `sherpa-onnx-v${VERSION}-ios-shared-onnxruntime-static.xcframework.zip`;
const URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/xcframework/${ASSET}`;
/**
 * Records which asset the current vendor/ contents came from. A cached vendor
 * dir (Codemagic caches it) from a different asset — e.g. the old `ios-static`
 * one — is wiped and re-fetched instead of being trusted.
 */
const MARKER = path.join(VENDOR_DIR, '.vendored-asset');

const log = msg => process.stdout.write(`[fetch-sherpa-onnx] ${msg}\n`);
const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });

function existingXcframeworks() {
  if (!fs.existsSync(VENDOR_DIR)) return [];
  return fs
    .readdirSync(VENDOR_DIR)
    .filter(name => name.endsWith('.xcframework'))
    .map(name => path.join(VENDOR_DIR, name));
}

function main() {
  if (process.platform !== 'darwin') {
    log(`skipped: iOS-only step, platform is ${process.platform}.`);
    return;
  }

  const current = existingXcframeworks();
  const marked = fs.existsSync(MARKER)
    ? fs.readFileSync(MARKER, 'utf8').trim()
    : null;
  if (
    current.length === 1 &&
    fs.existsSync(path.join(current[0], 'Info.plist')) &&
    marked === ASSET
  ) {
    log(`already vendored from ${ASSET} — nothing to do.`);
    return;
  }

  // Stale/mismatched cache (or a previous partial run): start clean.
  for (const xcf of current) {
    log(`removing stale ${path.basename(xcf)}`);
    fs.rmSync(xcf, { recursive: true, force: true });
  }
  fs.rmSync(MARKER, { force: true });

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-onnx-'));
  const zip = path.join(tmp, ASSET);

  log(`downloading ${URL}`);
  run(`curl -L --fail -o "${zip}" "${URL}"`);
  log('extracting');
  run(`unzip -q "${zip}" -d "${tmp}"`);

  // The zip may wrap the xcframework in a folder; find it at any depth.
  const found = execSync(
    `find "${tmp}" -maxdepth 3 -type d -name "*.xcframework"`,
    { encoding: 'utf8' },
  )
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  if (found.length === 0) {
    throw new Error(`no *.xcframework found inside ${ASSET}.`);
  }

  for (const src of found) {
    const dest = path.join(VENDOR_DIR, path.basename(src));
    run(`cp -R "${src}" "${dest}"`);
    log(`vendored ${path.basename(src)}`);
  }
  fs.writeFileSync(MARKER, `${ASSET}\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

try {
  main();
} catch (err) {
  log(`FAILED: ${err.message}`);
  log('Kokoro will be unavailable in this build; the rest of the app is fine.');
  process.exitCode = process.env.CI ? 1 : 0;
}
