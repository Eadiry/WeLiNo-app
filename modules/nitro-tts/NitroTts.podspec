require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroTts"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/LNReader/lnreader.git", :tag => "#{s.version}" }
  s.source_files   = ["ios/**/*.{swift}"]
  s.exclude_files  = ["ios/vendor/**/*"]

  # On-device Kokoro engine (optional): `scripts/fetch-sherpa-onnx.cjs`
  # (gitignored, macOS/CI only) vendors k2-fsa's prebuilt
  # `SherpaOnnxC.xcframework` — the `ios-shared-onnxruntime-static` variant: a
  # *dynamic* `SherpaOnnxC.framework` with ONNX Runtime statically linked
  # inside it (one self-contained framework). Its bundled modulemap names the
  # Clang module `SherpaOnnxC`, which `KokoroSpeechEngine.swift` imports.
  #
  # CocoaPods SILENTLY IGNORES `vendored_frameworks` on this dev pod (build #33:
  # framework on disk, `vendored? true`, yet zero `SherpaOnnxC` in xcodebuild).
  # So the link flag + search paths are set by hand — on the pod target for the
  # `import SherpaOnnxC` compile, and on the app target (`user_target_xcconfig`)
  # for the final link. This is exactly what build #31 used and it DID link
  # SherpaOnnxC; the only bug then was the `-ios-static` asset (no ONNX
  # Runtime → `_OrtGetApiBase` undefined). Keeping `vendored_frameworks` too so
  # CocoaPods still adds the embed + code-sign phase for the dynamic framework.
  #
  # When absent, `KokoroSpeechEngine.swift` compiles as a no-op via
  # `#if canImport(SherpaOnnxC)` and the app ships with Kokoro unavailable.
  vendor_xcf = File.join(__dir__, "ios", "vendor", "SherpaOnnxC.xcframework")
  vendored = File.exist?(File.join(vendor_xcf, "Info.plist"))
  warn "[NitroTts] SherpaOnnxC.xcframework vendored? #{vendored} (#{vendor_xcf})"
  if vendored
    s.vendored_frameworks = "ios/vendor/SherpaOnnxC.xcframework"

    slices =
      Dir.glob(File.join(vendor_xcf, "ios-*"))
        .select { |p| File.directory?(p) }
        .map { |p| File.basename(p) }
        .sort # "ios-arm64" (device) first

    pod_paths = slices
      .map { |b| "\"$(PODS_TARGET_SRCROOT)/ios/vendor/SherpaOnnxC.xcframework/#{b}\"" }
      .join(" ")
    app_paths = slices
      .map { |b| "\"$(PODS_ROOT)/../../modules/nitro-tts/ios/vendor/SherpaOnnxC.xcframework/#{b}\"" }
      .join(" ")

    s.pod_target_xcconfig = {
      "FRAMEWORK_SEARCH_PATHS" => "$(inherited) #{pod_paths}",
    }
    s.user_target_xcconfig = {
      "FRAMEWORK_SEARCH_PATHS" => "$(inherited) #{app_paths}",
      "OTHER_LDFLAGS" => "$(inherited) -framework SherpaOnnxC",
    }

    # sherpa-onnx + the bundled ONNX Runtime pull in the C++ runtime and BLAS.
    s.libraries  = "c++"
    s.frameworks = "Accelerate"
  end

  load "nitrogen/generated/ios/NitroTts+autolinking.rb"
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
