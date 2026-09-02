import AVFAudio
import Foundation
import NitroModules

#if canImport(SherpaOnnxC)
  import SherpaOnnxC
#endif

/// On-device Kokoro synthesis, used by `TtsPlaybackCoordinator` only when the
/// reader picks `engineKind == "kokoro"`. Everything here is dormant until then
/// — the coordinator never touches this type on the system-`AVSpeechSynthesizer`
/// path.
///
/// `scripts/fetch-sherpa-onnx.cjs` vendors `SherpaOnnxC.xcframework` (the
/// `ios-shared-onnxruntime-static` build, ONNX Runtime baked in, bundled clang
/// module `SherpaOnnxC`) into `modules/nitro-tts/ios/vendor/`, linked by
/// `NitroTts.podspec` via `vendored_frameworks`. When it's absent the whole
/// file compiles as a no-op via `#if canImport(SherpaOnnxC)`.
final class KokoroSpeechEngine {
  /// Natural-completion callback (last scheduled buffer finished rendering).
  var onFinish: (() -> Void)?
  /// Fatal synthesis/inference failure.
  var onError: ((String) -> Void)?

  private let audioEngine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  /// One serial queue so inference for a paragraph runs in order and a `stop`
  /// can cancel the tail cheaply via `generation`.
  private let workQueue = DispatchQueue(label: "com.welino.kokoro.inference")

  private var loadedModelDir: String?
  private var sampleRate: Double = 24_000
  /// Bumped on every `speak`/`stop` so stale inference results are dropped.
  private var generation = 0
  private var pendingBuffers = 0
  private var generationFinished = false

  private(set) var isPaused = false

  #if canImport(SherpaOnnxC)
    private var tts: OpaquePointer?
  #endif

  // MARK: - Lifecycle

  /// (Re)creates the native Kokoro handle from the files in `modelDir`. Cheap
  /// no-op when the same directory is already loaded.
  func prepare(modelDir: String) throws {
    guard loadedModelDir != modelDir else { return }

    #if canImport(SherpaOnnxC)
      let fm = FileManager.default
      let model = modelDir + "/model.onnx"
      let voices = modelDir + "/voices.bin"
      let tokens = modelDir + "/tokens.txt"
      let dataDir = modelDir + "/espeak-ng-data"
      for path in [model, voices, tokens] where !fm.fileExists(atPath: path) {
        throw RuntimeError.error(withMessage: "Kokoro model file missing: \(path)")
      }

      destroyHandle()

      var kokoro = SherpaOnnxOfflineTtsKokoroModelConfig()
      let cModel = strdup(model)
      let cVoices = strdup(voices)
      let cTokens = strdup(tokens)
      let cDataDir = strdup(dataDir)
      defer { free(cModel); free(cVoices); free(cTokens); free(cDataDir) }
      kokoro.model = UnsafePointer(cModel)
      kokoro.voices = UnsafePointer(cVoices)
      kokoro.tokens = UnsafePointer(cTokens)
      kokoro.data_dir = UnsafePointer(cDataDir)
      kokoro.length_scale = 1.0

      var modelConfig = SherpaOnnxOfflineTtsModelConfig()
      modelConfig.kokoro = kokoro
      modelConfig.num_threads = 2
      modelConfig.debug = 0
      let cProvider = strdup("cpu")
      defer { free(cProvider) }
      modelConfig.provider = UnsafePointer(cProvider)

      var config = SherpaOnnxOfflineTtsConfig()
      config.model = modelConfig
      config.max_num_sentences = 1

      guard let handle = SherpaOnnxCreateOfflineTts(&config) else {
        throw RuntimeError.error(withMessage: "Kokoro engine failed to initialise.")
      }
      tts = handle
      sampleRate = Double(SherpaOnnxOfflineTtsSampleRate(handle))
      if sampleRate <= 0 { sampleRate = 24_000 }
      loadedModelDir = modelDir
    #else
      throw RuntimeError.error(
        withMessage: "This build was compiled without the Kokoro engine."
      )
    #endif
  }

  // MARK: - Playback

  func speak(text: String, settings: TtsSettings) {
    guard let modelDir = settings.kokoroModelDir, !modelDir.isEmpty else {
      onError?("No Kokoro model is installed.")
      return
    }
    do {
      try prepare(modelDir: modelDir)
    } catch {
      onError?(error.localizedDescription)
      return
    }

    generation += 1
    let gen = generation
    isPaused = false
    generationFinished = false
    pendingBuffers = 0

    let speakerId = Int32(settings.voiceIdentifier.flatMap { Int($0) } ?? 0)
    // Kokoro's "speed" is inverse of length; keep it in a sane band.
    let speed = Float(min(max(settings.rate, 0.5), 2.0))

    startAudioGraphIfNeeded()
    playerNode.play()

    let sentences = Self.splitIntoSentences(text)

    workQueue.async { [weak self] in
      guard let self else { return }
      for sentence in sentences {
        if gen != self.generation { return }
        #if canImport(SherpaOnnxC)
          guard let handle = self.tts else { return }
          guard
            let audio = SherpaOnnxOfflineTtsGenerate(
              handle, sentence, speakerId, speed
            )
          else { continue }
          defer { SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio) }
          let count = Int(audio.pointee.n)
          if count > 0, let samples = audio.pointee.samples {
            let buffer = self.makeBuffer(from: samples, count: count)
            if let buffer, gen == self.generation {
              self.schedule(buffer, generation: gen)
            }
          }
        #endif
      }
      self.workQueue.async {
        guard gen == self.generation else { return }
        self.generationFinished = true
        self.finishIfDrained(generation: gen)
      }
    }
  }

  func pause() {
    guard playerNode.isPlaying else { return }
    playerNode.pause()
    isPaused = true
  }

  func resume() {
    guard isPaused else { return }
    startAudioGraphIfNeeded()
    playerNode.play()
    isPaused = false
  }

  func stop() {
    generation += 1
    generationFinished = false
    pendingBuffers = 0
    isPaused = false
    playerNode.stop()
    if audioEngine.isRunning {
      audioEngine.stop()
    }
  }

  // MARK: - Audio graph

  private func startAudioGraphIfNeeded() {
    if audioEngine.attachedNodes.contains(playerNode) == false {
      audioEngine.attach(playerNode)
      let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: sampleRate,
        channels: 1,
        interleaved: false
      )
      audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: format)
    }
    if !audioEngine.isRunning {
      do {
        try audioEngine.start()
      } catch {
        onError?("Kokoro audio engine failed to start: \(error.localizedDescription)")
      }
    }
  }

  private func makeBuffer(
    from samples: UnsafePointer<Float>,
    count: Int
  ) -> AVAudioPCMBuffer? {
    guard
      let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: sampleRate,
        channels: 1,
        interleaved: false
      ),
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: AVAudioFrameCount(count)
      )
    else { return nil }
    buffer.frameLength = AVAudioFrameCount(count)
    if let channel = buffer.floatChannelData?[0] {
      channel.update(from: samples, count: count)
    }
    return buffer
  }

  private func schedule(_ buffer: AVAudioPCMBuffer, generation gen: Int) {
    workQueue.async { [weak self] in
      guard let self, gen == self.generation else { return }
      self.pendingBuffers += 1
    }
    playerNode.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) {
      [weak self] _ in
      self?.workQueue.async {
        guard let self, gen == self.generation else { return }
        self.pendingBuffers -= 1
        self.finishIfDrained(generation: gen)
      }
    }
  }

  private func finishIfDrained(generation gen: Int) {
    guard
      gen == generation,
      generationFinished,
      pendingBuffers <= 0
    else { return }
    DispatchQueue.main.async { [weak self] in
      self?.onFinish?()
    }
  }

  private func destroyHandle() {
    #if canImport(SherpaOnnxC)
      if let handle = tts {
        SherpaOnnxDestroyOfflineTts(handle)
        tts = nil
      }
    #endif
  }

  // MARK: - Text

  /// Sentence-ish chunks so the first audio starts before the whole paragraph
  /// has been synthesised. Falls back to the whole string.
  static func splitIntoSentences(_ text: String) -> [String] {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return [] }
    var out: [String] = []
    var current = ""
    for ch in trimmed {
      current.append(ch)
      if ch == "." || ch == "!" || ch == "?" || ch == "…" || ch == "\n" {
        let piece = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !piece.isEmpty { out.append(piece) }
        current = ""
      }
    }
    let tail = current.trimmingCharacters(in: .whitespacesAndNewlines)
    if !tail.isEmpty { out.append(tail) }
    return out.isEmpty ? [trimmed] : out
  }

  deinit {
    destroyHandle()
  }
}
