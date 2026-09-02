/**
 * Native speech preferences applied to every queued paragraph.
 *
 * @see {@linkcode TtsSession.updateSettings}
 */
export interface TtsSettings {
  /**
   * Android only: engine package name from {@linkcode TtsFactory.getEngines},
   * or the system default when absent. Ignored on iOS.
   */
  engineName?: string;
  /** Platform voice identifier, or the platform default when absent. */
  voiceIdentifier?: string;
  /** Speech-rate multiplier selected by the reader. */
  rate: number;
  /** Voice-pitch multiplier selected by the reader. */
  pitch: number;
  /**
   * iOS: which synthesis backend to drive each paragraph.
   * `"system"` (or absent) → `AVSpeechSynthesizer`; `"kokoro"` → the on-device
   * Kokoro engine, which also needs {@linkcode TtsSettings.kokoroModelDir}.
   * Ignored on Android (always the system engine).
   */
  engineKind?: string;
  /**
   * iOS + `engineKind === "kokoro"`: absolute path to the directory holding the
   * downloaded Kokoro model bundle (`model.onnx`, `tokens.txt`, `voices.bin`,
   * `espeak-ng-data/`). When `engineKind` is `"kokoro"`,
   * {@linkcode TtsSettings.voiceIdentifier} carries the Kokoro voice id.
   */
  kokoroModelDir?: string;
}
