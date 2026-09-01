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

- **Reader CSS/JS** — _fixed_, see Milestone 1.5 below. Fonts are still
  `file:///android_asset` (only matters if a non-default reader font is
  picked; default `fontFamily` is `''`).
- **Background downloads / scheduled updates** — no-ops on iOS (see table).
- **`native-doh`** (DNS-over-HTTPS) — Android-only module, `requireOptionalNativeModule`,
  returns `null` on iOS; the Advanced settings entry should hide itself.
- **`nitro-epub`** (EPUB export) — C++ Nitro module with committed
  `nitrogen/generated/ios/`; _expected_ to build for iOS. If `pod install`
  fails on it, gate the export button behind `Platform.OS === 'android'` and
  exclude the pod.

### Android-only features hidden on iOS

Gated behind `Platform.OS === 'android'` (kept in code for Android + clean
upstream merges):

- **APK self-updater** (`AppUpdateChecker` in `Main.tsx`) — iOS updates via
  TestFlight / App Store.
- **Volume-button page turning** — reader bottom sheet + `NavigationTab`
  toggle & offset. No iOS media-volume hook (`native-volume-button-listener`
  is a stub).
- **Automatic library updates** (`SettingsLibraryScreen`) and **automatic
  backups** — frequency + location (`SettingsBackupScreen`). Need a native
  background task + persisted folder grant, neither on iOS yet.
- Already platform-gated by their libraries: **Material You / dynamic
  colors** (`isDynamicThemeSupported` is Android-12+), **DNS-over-HTTPS**
  (`native-doh`, `Platform.OS === 'android' && NativeDoh`).

Still visible but not yet functional on iOS (cross-platform features
needing an iOS path, not Android-only): manual backup create/restore (SAF
pickers), chapter downloads (background-task no-op), EPUB export.

### iOS UX fixes

- **No way to go back.** Top-level stacks (`Main.tsx`, `MoreStack.tsx`) set
  `animation: 'none'`, which also kills native-stack's interactive
  swipe-back on iOS — and there's no hardware back button. iOS now gets
  `animation: 'default'` + `gestureEnabled` + `fullScreenGestureEnabled`
  (swipe anywhere to go back); Android keeps `'none'`. Shared `Appbar`
  used `StatusBar.currentHeight` (Android-only) for `statusBarHeight`,
  dropping the header under the Dynamic Island; now uses the safe-area top
  inset on iOS.
- **Browse filters had no visible dropdown affordance.** `FilterBottomSheet`
  `Picker` filters (translation status, sort by, …) rendered as a bare
  disabled `TextInput` with no caret and an unreliable iOS tap target. Added
  a `menu-down`/`menu-up` right icon and wrapped the field in
  `pointerEvents="none"` so the whole row is one tap target — matches the
  language picker.

### Build-log / runtime fixes applied

- **"undefined is not a function" opening a chapter (reader crash).**
  `modules/native-volume-button-listener/ios/…Module.swift` was a stub that
  declared the events but not `setActive`, which the reader
  (`src/screens/reader/…`) calls unconditionally in a `useEffect`. Added a
  no-op `Function("setActive")`. Also stubbed `native-file`'s missing iOS
  functions (`createDocument`, `pickDocument`, `pickDirectory` — Android SAF
  pickers) so backup-import / choose-folder reject cleanly instead of
  crashing the JS VM. To symbolicate a Hermes release trace: the Xcode
  bundle phase ships an **un-minified** JS bundle, so reproduce with
  `npx expo export:embed --platform ios --dev false --minify false
--entry-file index.js --bundle-output main.jsbundle --sourcemap-output
main.jsbundle.map`.

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

### Reader assets inlined _(done)_

The WebView reader pulled every stylesheet and script from
`file:///android_asset/...`, which doesn't exist on iOS — so on iPhone the
chapter was raw unstyled HTML with **no scroll handling, no tap-to-toggle
toolbar, no chapter navigation, and no safe-area padding** (content ran under
the Dynamic Island).

- `scripts/generate-reader-assets.cjs` bundles `assets/reader/{css,js}`
  (~85 KB) into `src/screens/reader/utils/readerAssets.ts` as `READER_CSS` +
  `READER_SCRIPTS`. Committed; regenerated by `pnpm generate:reader-assets`
  (wired into `dev:ios` and a `codemagic.yaml` step). Excluded from
  prettier/eslint.
- `WebViewReader.tsx` inlines them as `<style>` / `<script>` blocks instead of
  `<link>` / `<script src>`. `assetsUriPrefix` is gone.
- **Safe area:** `--StatusBar-currentHeight` was `StatusBar.currentHeight`
  (Android-only → `undefinedpx` on iOS). Now `useSafeAreaInsets().top` on iOS;
  added `--reader-bottom-inset` + `viewport-fit=cover` and pad the body past
  the home indicator.
- **Escape hatch:** `useChapter` starts the reader chrome **visible** on iOS
  (`hidden = Platform.OS !== 'ios'`) so the back button is always reachable; a
  tap still toggles it. Android unchanged.

Still `file:///android_asset`: the `@font-face` for a custom reader font
(`<style id="ln-font">`). Default font is the system font, so this only bites
if the user picks Lora/Nunito/etc. — inline the one selected `.ttf` as a
data: URI when we get to it.

### Reader chrome redesigned _(done)_

The reader UI was rebuilt to match a reference reading app:

- **`ReaderAppbar`** — `✕` close / `headphones` (start TTS) / `Aa`
  (`format-size`, opens the settings panel) / `download` / `⋮` (bookmark,
  search, refresh, open-in-WebView/browser, share). Title moved to the footer.
- **`ReaderSettingsPanel.tsx`** (new) — right slide-in sheet: text-size
  steppers, Color / Font / Margins / Line Spacing dropdowns (named presets in
  `readerConstants.ts`), "No Line Break" (`removeExtraParagraphSpacing`) and
  "No Text Indent" (`removeTextIndent`, new `ChapterGeneralSettings` field)
  switches, and a "More settings" row that opens the old `ReaderBottomSheetV2`.
- **`ReaderFooter`** — progress % + draggable seek slider flanked by
  prev/next-chapter chevrons; novel + chapter title; chapters button +
  Scroll/Page segmented toggle (`pageReader`).
- **`ChapterDrawer`** — "✕ Close Book" header + "Chapters" sub-header; read
  chapters get a green `check-circle`; current row uses `theme.primary`;
  zebra striping.
- **`WebViewReader`** — new `--readerSettings-textIndent` /
  `--readerSettings-paragraphGap` CSS vars drive `#LNReader-chapter p`
  (first-line indent + blank line between paragraphs); pushed live via the
  MMKV `CHAPTER_GENERAL_SETTINGS` listener. `onProgress` prop feeds the
  footer seekbar; `ReaderScreen` injects `scrollTo` / `pageReader.movePage`
  to seek.

The per-chapter download button uses the normal `useDownload().downloadChapter`
path, so on iOS it enqueues but does nothing until the background-task module
is implemented (pre-existing limitation). No brightness slider (would need
`expo-brightness`); no comments button (LNReader has no comments).

### Reader gesture / TTS / rotation fixes

- **Swipe-back no longer dumps you in the library.** The Main-stack
  `ReaderStack` screen had `fullScreenGestureEnabled: true` (from the global
  iOS `backNavOptions`), so any horizontal drag mid-chapter popped the whole
  reader stack. Now `fullScreenGestureEnabled: false` on that screen, and the
  `Chapter` screen in `ReaderStack` sets `gestureEnabled: false` too — the
  left edge belongs to the chapter drawer, a big horizontal swipe is
  prev/next chapter (`swipeGestures`, now **on by default** in
  `initialChapterGeneralSettings`), and the `✕` button is the way out.
  `useChapterGeneralSettings` now merges stored settings over the defaults so
  the new default reaches users who already have a saved settings object.
- **TTS starts from the visible paragraph.** New `tts.startFromVisible()` in
  `assets/reader/js/core.js` picks the first on-screen readable element;
  `ReaderScreen.startTts` calls it instead of `tts.start()` (which always
  began at paragraph 0).
- **Rotation keeps your place.** Two causes: (a) `WebViewReader` had the
  safe-area insets in the `source` useMemo deps — rotation changes the insets
  → new `source` → the WebView _reloaded the whole chapter_. Insets are now a
  mount-time snapshot in the HTML and later changes are pushed via
  `injectJavaScript` (CSS vars), so `source` never changes on rotation.
  (b) `core.js`'s `resize` handler now records the viewport-centre fraction of
  the chapter before the reflow and scrolls back to it (scroll mode).
- **Returning to a chapter restores your position.** `useChapter.getChapter`
  now always re-reads the target row from the DB (was trusting the cached
  adjacent-chapter object, whose `progress` was stale), and `navigateChapter`
  flushes the outgoing chapter's `progress` before switching. Swiping back a
  chapter no longer lands at the top.
- **Paging back across a chapter boundary opens the previous chapter at its
  last page.** `core.js` `movePage` (destPage < 0) posts
  `{type:'prev', data:{openAtEnd:true}}`; `navigateChapter('PREV', {openAtEnd})`
  → `getChapter(prev, true)` forces `progress: 100` on the loaded row so
  `restoreReadingPosition` lands on the final page (never persisted — restore
  uses `save:false`).
- **TTS: no more chapter skips / silent stops.** `assets/reader/js/core.js`:
  `tts.start()` bails if there are no readable elements yet (an empty queue
  was being "completed" instantly by native and, with auto-advance, skipping
  a chapter); `tts.complete()` ignores a stray completion that arrives with
  nothing loaded/read (`totalElements === 0 || elementsRead === 0`) — that's
  the event landing in the _new_ chapter after an auto-advance. `tts`
  `autoPageAdvance` now **defaults on** (`initialChapterReaderSettings.tts`
  - the `useChapterReaderSettings` migration), so narration continues into
    the next chapter instead of stopping at each chapter end; toggle in reader
    TTS settings.
- **Page-mode swipes.** `core.js` swipe handler: page-turn threshold 30% → 16%
  of the width, plus a flick-velocity shortcut; `touchmove` is now
  non-passive and calls `preventDefault()` on a mostly-horizontal drag so the
  page can't scroll up/down while turning; page transitions (swipe release,
  tap, buttons) use an ease-out curve.
- **More voices** is an iOS limitation — `AVSpeechSynthesizer` only exposes
  installed system voices, and **Siri voices are never returned to
  third-party apps**. Only the "Enhanced"/"Premium" downloadable voices show
  up. `TTSTab` now re-reads the voice list when the picker opens and on app
  foreground (a freshly downloaded voice isn't visible until then). Cloud TTS
  (Azure/Google/ElevenLabs) would be a separate feature.

### `NativeFile.downloadFile` implemented for iOS

It was a `NOT_IMPLEMENTED` stub. Consequence: tapping **Refresh** on a novel
(with "refresh metadata" on) ran `updateNovelMetadata`, whose cover
re-download always threw, and the `catch` then wrote `cover: null` — wiping
the cover. Fixes:

- `modules/native-file/ios/NativeFileModule.swift` — real `downloadFile` via
  `URLSession.dataTask` (method + headers + optional body, writes bytes to
  `destPath`, creates parent dirs, checks HTTP status). Unblocks cover
  refresh and chapter-image caching on iOS.
- `src/services/updates/LibraryUpdateQueries.ts` `updateNovelMetadata` — a
  failed cover download now falls back to the remote URL instead of `null`,
  and the DB `.set()` omits `cover` entirely unless a fresh one resolved. A
  broken refresh can no longer erase the cover.

### Remaining 1.5 work

Verify `nitro-tts` actually plays with the screen locked + lock-screen
controls on a real device (LNReader's iOS TTS has never been exercised).

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
3. **On-device Kokoro TTS** _(decided; do after Milestone 1 is signed off)_.
   Kokoro-82M (Apache-2.0, ~54 voices) as a second synthesis engine alongside
   `AVSpeechSynthesizer`, running **fully on the phone** — no API key, no
   network, no per-use cost. Pieces:
   - **Model**: `kokoro-v1.0` ONNX (quantized int8 ~90 MB) + `voices-v1.0.bin`
     (~26 MB). Download on first use into app storage (don't bloat the IPA).
   - **Inference**: `onnxruntime` for iOS (there's `onnxruntime-react-native`,
     or a small Nitro/Expo native wrapper). Output is 24 kHz mono float PCM.
   - **Phonemizer (the hard part)**: Kokoro takes phonemes, not text. Normally
     espeak-ng (C) does G2P — needs cross-compiling for iOS, or a pure
     JS/Swift G2P. Evaluate an espeak-ng iOS fork vs. a JS phonemizer.
   - **Playback**: feed PCM to `AVAudioEngine`/`AVAudioPlayerNode`; synthesize
     per-sentence chunks so playback can start fast and the paragraph queue +
     lock-screen controls + background audio keep working. Slot into the same
     coordinator as item 1.
   - Reader TTS settings gain an engine picker (System vs Kokoro) + Kokoro
     voice list.

## Reference

The Capacitor WeLiNo (previous approach, still builds/ships) is at
`../WeLiNo`. Its `codemagic.yaml` signing recipe is the basis for this one.
