const { withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const pbxFile = require('xcode/lib/pbxFile');
const fs = require('fs');
const path = require('path');

/**
 * Embeds the vendored `SherpaOnnxC.xcframework` (on-device Kokoro TTS) into the
 * app bundle.
 *
 * `scripts/fetch-sherpa-onnx.cjs` vendors the framework into
 * `modules/nitro-tts/ios/vendor/` and `NitroTts.podspec` links it — build #35
 * confirmed `Pods-WeLiNo.release.xcconfig` carries `-framework "SherpaOnnxC"`
 * plus the search paths. But CocoaPods adds it to *zero* build phases
 * (`grep -c sherpa Pods/Pods.xcodeproj/project.pbxproj` = 0): CocoaPods ignores
 * `vendored_frameworks` on the NitroTts dev (`:path`) pod, so the *dynamic*
 * `SherpaOnnxC.framework` never gets copied into `WeLiNo.app/Frameworks/` and
 * dyld aborts at launch:
 *
 *   Library not loaded: @rpath/SherpaOnnxC.framework/SherpaOnnxC
 *   (terminated at launch; ignore backtrace)
 *
 * This plugin adds the missing "Embed Frameworks" copy phase (CodeSignOnCopy)
 * to the app target — creating the phase if the template lacks one. Linking +
 * the Swift `import SherpaOnnxC` search paths stay in `NitroTts.podspec`; this
 * only copies + signs.
 *
 * No-op when the framework isn't vendored (non-macOS dev, or the fetch step was
 * skipped) — `KokoroSpeechEngine.swift` then compiles behind
 * `#if canImport(SherpaOnnxC)` as a no-op and Kokoro ships unavailable.
 */
const FRAMEWORK_NAME = 'SherpaOnnxC.xcframework';
// Relative to the generated `ios/` dir (`$(SRCROOT)` for the app target).
const FRAMEWORK_REL = path.posix.join(
  '..',
  'modules',
  'nitro-tts',
  'ios',
  'vendor',
  FRAMEWORK_NAME,
);
// process.stdout.write, not console.* — the repo's eslint bans `no-console`
// (scripts/fetch-sherpa-onnx.cjs does the same).
const log = msg => process.stdout.write(`[withSherpaOnnxFramework] ${msg}\n`);

module.exports = function withSherpaOnnxFramework(config) {
  return withXcodeProject(config, cfg => {
    const project = cfg.modResults;
    const iosRoot = cfg.modRequest.platformProjectRoot;

    if (!fs.existsSync(path.join(iosRoot, FRAMEWORK_REL, 'Info.plist'))) {
      log(
        `${FRAMEWORK_NAME} not vendored — skipping embed ` +
          `(on-device Kokoro TTS will be unavailable in this build).`,
      );
      return cfg;
    }

    const refSection = project.pbxFileReferenceSection();
    const already = Object.keys(refSection).some(
      k =>
        !k.endsWith('_comment') &&
        String(refSection[k].path || '').includes(FRAMEWORK_NAME),
    );
    if (already) {
      log(`${FRAMEWORK_NAME} already embedded — nothing to do.`);
      return cfg;
    }

    const { uuid: targetUuid } =
      IOSConfig.XcodeUtils.getApplicationNativeTarget({
        project,
        projectName: cfg.modRequest.projectName,
      });

    // Build the file entry by hand — `xcode`'s addFramework() leaves an
    // `.xcframework` as lastKnownFileType "unknown" with a `<group>` sourceTree,
    // which Xcode won't treat as an embeddable framework.
    const file = new pbxFile(FRAMEWORK_REL, {
      customFramework: true,
      embed: true,
      sign: true,
    });
    file.uuid = project.generateUuid();
    file.fileRef = project.generateUuid();
    file.lastKnownFileType = 'wrapper.xcframework';
    file.sourceTree = 'SOURCE_ROOT';
    delete file.explicitFileType;
    // file.settings is { ATTRIBUTES: ['CodeSignOnCopy'] } from the ctor.

    project.addToPbxBuildFileSection(file);
    project.addToPbxFileReferenceSection(file);
    project.addToFrameworksPbxGroup(file);

    // RN/Expo + CocoaPods apps embed pods via a *shell script* phase ("[CP]
    // Embed Pods Frameworks"), so the native copy phase is usually absent.
    let embedPhase = project.buildPhaseObject(
      'PBXCopyFilesBuildPhase',
      'Embed Frameworks',
      targetUuid,
    );
    if (!embedPhase) {
      project.addBuildPhase(
        [],
        'PBXCopyFilesBuildPhase',
        'Embed Frameworks',
        targetUuid,
        'frameworks', // dstSubfolderSpec = 10 (Frameworks)
      );
      embedPhase = project.buildPhaseObject(
        'PBXCopyFilesBuildPhase',
        'Embed Frameworks',
        targetUuid,
      );
      log('created "Embed Frameworks" copy phase.');
    }

    embedPhase.files.push({
      value: file.uuid,
      comment: `${FRAMEWORK_NAME} in Embed Frameworks`,
    });

    log(`embedded ${FRAMEWORK_NAME} (CodeSignOnCopy).`);
    return cfg;
  });
};
