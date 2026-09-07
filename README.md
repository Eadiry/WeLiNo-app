# WeLiNo — TTS voice packs

This repository only hosts the downloadable on-device text-to-speech voice
packs for [WeLiNo](https://github.com/Eadiry/WeLiNo). It is **not** the app —
it used to be a fork of LNReader; that code has been removed.

## How it works

The app (Settings → Voice repositories) fetches a **`voices.json`** manifest,
then downloads the engine bundle it points at. Each bundle is a
`sherpa-onnx` model (Piper / VITS or Kokoro) plus its `espeak-ng-data`,
published here as a **GitHub Release** asset.

- Manifest (paste this URL into the app):
  `https://raw.githubusercontent.com/Eadiry/WeLiNo-app/main/voices.json`
- Current pack: **Piper — LibriTTS (English)**, 6 voices, ~73 MB —
  [`piper-libritts-medium`](https://github.com/Eadiry/WeLiNo-app/releases/tag/piper-libritts-medium)
  release (`piper-libritts-medium.zip`).

## Adding / changing voices

- **New speaker from an existing pack** — add an entry to `voices.json`
  (`speakerId` is the model's speaker index) and commit.
- **New model** — build a flat zip (`model.onnx`, `tokens.txt`,
  `espeak-ng-data/`; Kokoro also needs `voices.bin`), attach it to a new
  release, and point a manifest's `bundleUrl` at it. One manifest describes
  one engine bundle.

## Manifest format

```jsonc
{
  "engine": {
    "id": "piper-libritts-medium",
    "name": "Piper — LibriTTS (English)",
    "format": "sherpa-onnx-vits",        // or "sherpa-onnx-kokoro"
    "bundleUrl": "https://…/pack.zip",    // flat zip, extracted into the engine dir
    "bundleBytes": 73308398              // for the progress bar
  },
  "voices": [
    { "id": "libritts-ava", "name": "Ava (Female)", "language": "en-US", "speakerId": 0 }
  ]
}
```

## Licensing

Models are redistributed from
[k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) `tts-models`
(Piper models: MIT; LibriTTS-R training data: CC BY 4.0). `espeak-ng-data` is
GPL-3.0 (data files, redistributed unmodified).
