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
  # (gitignored, macOS/CI only) vendors the prebuilt sherpa-onnx
  # `ios-shared-onnxruntime-static` xcframework here — a *dynamic*
  # `sherpa-onnx.framework` with ONNX Runtime statically linked inside it, so
  # there is nothing else to link. CocoaPods reads `vendored_frameworks` and
  # wires the `-framework` flag, the search path, and (because it is dynamic)
  # an embed + code-sign phase on its own — no manual xcconfig needed. The
  # inner framework is `sherpa-onnx.framework`; its bundled modulemap names the
  # Clang module `SherpaOnnxC`, which `KokoroSpeechEngine.swift` imports.
  #
  # When absent, that file compiles as a no-op via `#if canImport(SherpaOnnxC)`
  # and the app ships with Kokoro unavailable.
  vendor_xcf = File.join(__dir__, "ios", "vendor", "sherpa-onnx.xcframework")
  if File.exist?(File.join(vendor_xcf, "Info.plist"))
    s.vendored_frameworks = "ios/vendor/sherpa-onnx.xcframework"

    # sherpa-onnx + the bundled ONNX Runtime pull in the C++ runtime and BLAS.
    s.libraries  = "c++"
    s.frameworks = "Accelerate"
  end

  load "nitrogen/generated/ios/NitroTts+autolinking.rb"
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
