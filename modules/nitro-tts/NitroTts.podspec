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

  # On-device Kokoro engine (optional): the prebuilt sherpa-onnx.xcframework
  # (static, ONNX Runtime baked in — nothing to embed) is fetched into
  # ios/vendor/ by `scripts/fetch-sherpa-onnx.cjs` (gitignored, macOS/CI only).
  # When absent, `KokoroSpeechEngine.swift` compiles as a no-op via
  # `#if canImport(SherpaOnnxC)` and the app ships with Kokoro unavailable.
  #
  # `vendored_frameworks` alone did NOT make `import SherpaOnnxC` resolve in a
  # static-linkage project, so the xcframework's slice dirs are put on
  # FRAMEWORK_SEARCH_PATHS explicitly. Set here (before nitrogen), which
  # merge-preserves it.
  vendor_xcf = File.join(__dir__, "ios", "vendor", "sherpa-onnx.xcframework")
  if File.exist?(File.join(vendor_xcf, "Info.plist"))
    s.vendored_frameworks = "ios/vendor/sherpa-onnx.xcframework"
    slice_paths =
      Dir.glob(File.join(vendor_xcf, "ios-*"))
        .select { |p| File.directory?(p) }
        .sort # "ios-arm64" (device) before "ios-arm64_x86_64-simulator"
        .map { |p| "\"$(PODS_TARGET_SRCROOT)/ios/vendor/sherpa-onnx.xcframework/#{File.basename(p)}\"" }
        .join(" ")
    s.pod_target_xcconfig = {
      "FRAMEWORK_SEARCH_PATHS" => "$(inherited) #{slice_paths}",
    }
    # sherpa-onnx + the bundled ONNX Runtime pull in the C++ runtime and BLAS.
    s.libraries  = "c++"
    s.frameworks = "Accelerate"
  end

  load "nitrogen/generated/ios/NitroTts+autolinking.rb"
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
