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
  # `SherpaOnnxC.xcframework` here — the `ios-shared-onnxruntime-static`
  # variant: a *dynamic* `SherpaOnnxC.framework` with ONNX Runtime statically
  # linked inside it (one self-contained framework, nothing else to link). Its
  # bundled modulemap names the Clang module `SherpaOnnxC`, which
  # `KokoroSpeechEngine.swift` imports.
  #
  # Being a dynamic xcframework whose outer name matches the framework name,
  # `vendored_frameworks` is enough: CocoaPods wires `-framework SherpaOnnxC`,
  # the search path (so `import SherpaOnnxC` resolves), and an embed + sign
  # phase on its own. (The manual xcconfig in earlier revisions was only needed
  # for the *static* `-ios-static` variant, which does not bundle ONNX Runtime
  # — that left `_OrtGetApiBase` undefined at Ld, build #31.)
  #
  # When absent, `KokoroSpeechEngine.swift` compiles as a no-op via
  # `#if canImport(SherpaOnnxC)` and the app ships with Kokoro unavailable.
  vendor_xcf = File.join(__dir__, "ios", "vendor", "SherpaOnnxC.xcframework")
  vendored = File.exist?(File.join(vendor_xcf, "Info.plist"))
  warn "[NitroTts] SherpaOnnxC.xcframework vendored? #{vendored} (#{vendor_xcf})"
  if vendored
    s.vendored_frameworks = "ios/vendor/SherpaOnnxC.xcframework"

    # Compile-time insurance: make sure the pod's own target can find the
    # module even if CocoaPods' automatic xcframework search-path injection
    # doesn't reach it. Link + embed/sign still come from vendored_frameworks.
    s.pod_target_xcconfig = {
      "FRAMEWORK_SEARCH_PATHS" => '$(inherited) "$(PODS_TARGET_SRCROOT)/ios/vendor"',
    }

    # sherpa-onnx + the bundled ONNX Runtime pull in the C++ runtime and BLAS.
    s.libraries  = "c++"
    s.frameworks = "Accelerate"
  end

  load "nitrogen/generated/ios/NitroTts+autolinking.rb"
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
