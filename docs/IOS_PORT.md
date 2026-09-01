# WeLiNo — iOS port of the LNReader v2 fork

This fork rebrands **LNReader v2** to **WeLiNo** and adds an iOS build.
LNReader ships Android only; nobody builds it for iOS, so a few things need
patching. WeLiNo's own features (continuous cross-chapter TTS, name
substitution, MTL cleanup, LanguageTool, CJK romanisation) go on top of this
base — see the milestones below.

Upstream stays on the `master` branch; all WeLiNo work is on `welino`.
`git fetch upstream && git merge upstream/master` to pull LNReader changes.

## Why LNReader v2 is a good base

`modules/nitro-tts/` already implements exactly the architecture WeLiNo needs,
**including a working iOS side** (`modules/nitro-tts/ios/`):

- `AVSpeechSynthesizer` + `AVAudioSession(.playback, .spokenAudio)` → screen-off playback
- `TtsRemoteCommandController.swift` → `MPRemoteCommandCenter` (lock-screen controls)
- `TtsNowPlayingController.swift` → `MPNowPlayingInfoCenter`
- `TtsPlaybackCoordinator.swift` → native-side paragraph queue, delegate-driven auto-advance
- JS driver: `src/screens/reader/hooks/useTtsSession.ts`

What it does **not** do (WeLiNo adds it): read past the end of the current
chapter. `completeQueue()` just stops. See Milestone 2.

## Milestone 1 — bare iOS TestFlight build _(in progress)_

Goal: a signed IPA that installs on an iPhone and launches without crashing.
No new features.

### Done on the `welino` branch

| Change                                                                                                               | File                                                                 | Why                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename to WeLiNo, bundle id `com.welino.reader`, `scheme: welino`                                                    | `app.json`                                                           | Sign with the existing WeLiNo cert/profile                                                                                                                                                                     |
| iOS `infoPlist`: `UIBackgroundModes:[audio]` (kept), `NSAllowsArbitraryLoads`, `ITSAppUsesNonExemptEncryption:false` | `app.json`                                                           | Background audio; scraper hits arbitrary http/TLS-weak sites; skip the encryption prompt                                                                                                                       |
| Removed LNReader's `extra.eas` project id                                                                            | `app.json`                                                           | We build on Codemagic, not EAS                                                                                                                                                                                 |
| `native-background-tasks`: `expo-module.config.json` → `platforms:["android"]` (dropped the unbacked `apple` block)  | module                                                               | The `apple` block referenced a Swift class that doesn't exist → autolinking/`ExpoModulesProvider.swift` compile error on iOS                                                                                   |
| `native-background-tasks`: `requireNativeModule` → `requireOptionalNativeModule` + a no-op fallback                  | `modules/native-background-tasks/src/NativeBackgroundTasksModule.ts` | `index.js` imports the download-queue barrel at startup; a hard require would crash the app on iOS. Background downloads + scheduled library/backup updates are **inert on iOS** until a native module exists. |
| `codemagic.yaml` — Expo prebuild → pod install → sign → IPA → App Store Connect                                      | new                                                                  | LNReader has no iOS CI                                                                                                                                                                                         |

### Known to still be broken on iOS (not launch blockers — deferred)

- **Reader is unstyled.** `src/screens/reader/components/WebViewReader.tsx`
  hardcodes `assetsUriPrefix = 'file:///android_asset'`, and
  `plugins/withReaderAssets.js` only copies `assets/reader/{css,js,fonts}` on
  Android (`withDangerousMod(['android', …])`). iOS needs its own copy step
  (into the app bundle) + a bundle-relative `assetsUriPrefix` / WebView
  `baseUrl`. → Milestone 1.5.
- **Background downloads / scheduled updates** — no-ops on iOS (see table).
- **`native-doh`** (DNS-over-HTTPS) — Android-only module, `requireOptionalNativeModule`,
  returns `null` on iOS; the Advanced settings entry should hide itself.
- **`nitro-epub`** (EPUB export) — C++ Nitro module with committed
  `nitrogen/generated/ios/`; _expected_ to build for iOS. If `pod install`
  fails on it, gate the export button behind `Platform.OS === 'android'` and
  exclude the pod.

### Build-log / runtime fixes applied

- **Stuck on splash screen (first TestFlight install).** `src/database/db.ts`
  opened op-sqlite with `location: '../files/SQLite'` — an Android-only path
  (relative to the app's files dir). On iOS that parent doesn't exist and
  op-sqlite doesn't create it, so `open()` threw at module load, `import App`
  failed, and the JS root never mounted → native splash forever. Now the
  `location` override is Android-only; iOS uses the default location.

- **`pod install` failed**: `AppCheckCore` (Swift, via
  `@react-native-google-signin/google-signin`) depends on `GoogleUtilities`
  / `RecaptchaInterop`, which don't define modules → can't integrate as
  static libs. Fixed with `expo-build-properties` `ios.extraPods` +
  `modular_headers: true` for `GoogleUtilities`, `RecaptchaInterop`,
  `AppCheckCore`. If a later error names more Google/Firebase pods, add them
  there too (or switch to `use_modular_headers!` globally).

### First Codemagic build — likely failure points

1. **`pod install`** on Expo 57 / RN 0.86 / New Arch — watch for `nitro-epub`
   / `react-native-worklets` / reanimated 4 pod errors.
2. **`expo prebuild`** running a config plugin that assumes Android — the two
   local plugins are `android`-scoped dangerous mods so they no-op on iOS,
   but double-check the log.
3. **Xcode scheme name** — the workflow discovers it with
   `find ios -maxdepth 1 -name '*.xcworkspace'`; if `expo prebuild` names it
   unexpectedly the build log's `workspace=… scheme=…` line shows what to use.
4. **Signing** — bundle id in `app.json` (`com.welino.reader`) must match the
   provisioning profile exactly.

## Milestone 1.5 — usable reader on iOS

Fix reader assets (above). Verify `nitro-tts` actually plays with the screen
locked + lock-screen controls on a real device (LNReader's iOS TTS has never
been exercised).

## Milestone 2 — WeLiNo features

1. **Continuous cross-chapter TTS.** JS builds the paragraph queue from the
   current chapter **plus N ahead** (fetch/parse/process each), tags each
   paragraph with its chapter, pushes all in one `session.load()` so native
   survives JS suspension; tops up on foreground; updates now-playing
   metadata + reading position on chapter crossings. The Swift
   `TtsPlaybackCoordinator` needs an `append(paragraphs:)` (today only
   `load()` which replaces) and a low-water / `queueLow` event.
2. **Text pipeline** before `load()`: persistent character-name substitution,
   offline MTL cleanup, LanguageTool deep-clean, CJK auto-romanisation.
   Port from the Capacitor WeLiNo repo (`src/pipeline/`, `src/substitution/`).

## Reference

The Capacitor WeLiNo (previous approach, still builds/ships) is at
`../WeLiNo`. Its `codemagic.yaml` signing recipe is the basis for this one.
