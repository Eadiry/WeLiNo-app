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

  # On-device Kokoro engine (optional): the prebuilt sherpa-onnx + onnxruntime
  # xcframeworks are fetched into ios/vendor/ by `scripts/fetch-sherpa-onnx.cjs`
  # (gitignored, macOS/CI only). When absent, `KokoroSpeechEngine.swift`
  # compiles as a no-op via `#if canImport(CSherpaOnnx)` and the app ships with
  # Kokoro unavailable — nothing else is affected.
  vendor_dir = File.join(__dir__, "ios", "vendor")
  kokoro_frameworks =
    Dir.exist?(vendor_dir) ? Dir.glob(File.join(vendor_dir, "*.xcframework")) : []
  unless kokoro_frameworks.empty?
    s.vendored_frameworks =
      kokoro_frameworks.map { |f| "ios/vendor/#{File.basename(f)}" }
  end

  load "nitrogen/generated/ios/NitroTts+autolinking.rb"
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
