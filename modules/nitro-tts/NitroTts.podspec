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
  # In this static-linkage project, `vendored_frameworks` alone got neither
  # `import SherpaOnnxC` (compile) nor `-framework SherpaOnnxC` (app link)
  # wired up, so both search path and link flag are set explicitly — on the
  # pod for compilation, and on the *app* target (user_target_xcconfig) for the
  # final link, which is where `_SherpaOnnx*` was coming up undefined.
  vendor_xcf = File.join(__dir__, "ios", "vendor", "SherpaOnnxC.xcframework")
  if File.exist?(File.join(vendor_xcf, "Info.plist"))
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
