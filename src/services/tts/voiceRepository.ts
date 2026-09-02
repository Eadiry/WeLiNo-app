import NativeFile from '@modules/native-file';
import NativeZipArchive from '@modules/native-zip-archive';
import { downloadFile } from '@plugins/helpers/fetch';
import { getEnabledVoiceRepositoriesFromDb } from '@database/queries/VoiceRepositoryQueries';
import { TTS_STORAGE } from '@utils/Storages';

/**
 * On-device TTS voice repositories — same shape as the plugin repositories, but
 * the manifest describes a synthesis **engine bundle** (a Kokoro model + its
 * data files) plus the **voices** it offers.
 *
 * A `voices.json` manifest — the engine is either **one zip** of the model
 * folder (simplest to host) or a **per-file** list:
 *
 * ```json
 * {
 *   "engine": {
 *     "id": "kokoro-en-v0_19",
 *     "name": "Kokoro 82M (English)",
 *     "format": "sherpa-onnx-kokoro",
 *     "bundleUrl": "https://…/kokoro-en-v0_19.zip",
 *     "bundleBytes": 340000000
 *   },
 *   "voices": [
 *     { "id": "af_sarah", "name": "Sarah (US female)", "language": "en-US", "speakerId": 3 }
 *   ]
 * }
 * ```
 *
 * The zip is extracted flat into the engine dir; a single wrapping folder
 * (`kokoro-en-v0_19/model.onnx` …) is lifted up automatically. The per-file
 * form instead lists `files: [{ path, url, bytes, unzip? }]` — flat filenames,
 * `unzip:true` for a directory shipped as its own `.zip`.
 */

export interface VoiceManifestFile {
  /** Flat filename, or — for `unzip` entries — the directory left after extraction. */
  path: string;
  url: string;
  bytes?: number;
  sha256?: string;
  unzip?: boolean;
}

export interface VoiceManifestEngine {
  id: string;
  name: string;
  /** Only `"sherpa-onnx-kokoro"` is understood today. */
  format: string;
  /**
   * A single `.zip` of the whole model folder (`model.onnx`, `tokens.txt`,
   * `voices.bin`, `espeak-ng-data/` …), extracted flat into the engine dir.
   * The simplest way to host a bundle — provide this OR `files`.
   */
  bundleUrl?: string;
  /** Approximate download size of `bundleUrl`, for the progress bar. */
  bundleBytes?: number;
  /** Per-file layout — an alternative to `bundleUrl`. */
  files?: VoiceManifestFile[];
}

export interface KokoroVoice {
  id: string;
  name: string;
  language?: string;
  speakerId: number;
}

export interface VoiceManifest {
  engine: VoiceManifestEngine;
  voices: KokoroVoice[];
}

export interface LoadedVoiceManifest {
  repoUrl: string;
  manifest: VoiceManifest;
}

/** A voice plus the engine it belongs to — what the reader voice picker lists. */
export interface InstalledKokoroVoice extends KokoroVoice {
  engineId: string;
  engineName: string;
}

const isFlatName = (name: string) =>
  typeof name === 'string' &&
  name.length > 0 &&
  !name.includes('/') &&
  !name.includes('..') &&
  !name.startsWith('.');

/** Throws with a readable message when `raw` is not a well-formed manifest. */
export const parseVoiceManifest = (raw: unknown): VoiceManifest => {
  const obj = raw as Partial<VoiceManifest> | null;
  const engine = obj?.engine;
  if (!engine || typeof engine !== 'object') {
    throw new Error('Manifest is missing an "engine" object.');
  }
  if (!engine.id || !engine.name || !engine.format) {
    throw new Error('Manifest engine needs "id", "name" and "format".');
  }
  if (engine.format !== 'sherpa-onnx-kokoro') {
    throw new Error(`Unsupported engine format "${engine.format}".`);
  }
  const hasBundle =
    typeof engine.bundleUrl === 'string' &&
    /^https?:\/\//.test(engine.bundleUrl);
  const hasFiles = Array.isArray(engine.files) && engine.files.length > 0;
  if (!hasBundle && !hasFiles) {
    throw new Error('Manifest engine needs a "bundleUrl" or a "files" list.');
  }
  for (const file of engine.files ?? []) {
    if (!isFlatName(file?.path)) {
      throw new Error(
        `Manifest file "path" must be a plain name: ${file?.path}`,
      );
    }
    if (typeof file.url !== 'string' || !/^https?:\/\//.test(file.url)) {
      throw new Error(`Manifest file "${file.path}" has an invalid url.`);
    }
  }
  const voices = Array.isArray(obj?.voices) ? obj!.voices : [];
  for (const voice of voices) {
    if (!voice?.id || typeof voice.speakerId !== 'number') {
      throw new Error('Each voice needs an "id" and a numeric "speakerId".');
    }
  }
  return { engine: engine as VoiceManifestEngine, voices };
};

export const fetchVoiceManifest = async (
  url: string,
): Promise<VoiceManifest> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Manifest request failed (${res.status}).`);
  }
  return parseVoiceManifest(await res.json());
};

/** Every enabled repo's manifest; repos that fail to load are skipped. */
export const fetchAllVoiceManifests = async (): Promise<
  LoadedVoiceManifest[]
> => {
  const repos = await getEnabledVoiceRepositoriesFromDb();
  const loaded = await Promise.all(
    repos.map(async repo => {
      try {
        return {
          repoUrl: repo.url,
          manifest: await fetchVoiceManifest(repo.url),
        };
      } catch {
        return undefined;
      }
    }),
  );
  return loaded.filter((m): m is LoadedVoiceManifest => m !== undefined);
};

export const engineDir = (engineId: string) => `${TTS_STORAGE}/${engineId}`;

/** Files sherpa-onnx-kokoro always needs, regardless of how it was packaged. */
const KOKORO_CORE_FILES = ['model.onnx', 'tokens.txt', 'voices.bin'];

/** The plain files an installed engine dir must contain (unzip dirs excluded). */
const requiredFilePaths = (engine: VoiceManifestEngine) => {
  const names = engine.files?.length
    ? engine.files.filter(file => !file.unzip).map(file => file.path)
    : KOKORO_CORE_FILES;
  return names.map(name => `${engineDir(engine.id)}/${name}`);
};

export const isEngineInstalled = async (
  engine: VoiceManifestEngine,
): Promise<boolean> => {
  const checks = await Promise.all(
    requiredFilePaths(engine).map(path => NativeFile.exists(path)),
  );
  return checks.every(Boolean);
};

export interface InstallProgress {
  /** 0–1 across the whole bundle, weighted by declared byte size. */
  fraction: number;
  /** File currently downloading. */
  currentFile: string;
}

/**
 * Downloads (and extracts) an engine bundle into `engineDir(engine.id)`.
 * Re-running is safe — finished files are skipped.
 */
export const installEngine = async (
  engine: VoiceManifestEngine,
  onProgress?: (progress: InstallProgress) => void,
): Promise<void> => {
  const dir = engineDir(engine.id);
  if (!(await NativeFile.exists(dir))) {
    await NativeFile.mkdir(dir);
  }

  // Single-zip bundle: download it once and extract flat into the engine dir.
  if (engine.bundleUrl) {
    onProgress?.({ fraction: 0, currentFile: 'bundle.zip' });
    const tmp = `${dir}/bundle.zip`;
    if (!(await NativeFile.exists(`${dir}/model.onnx`))) {
      await downloadFile(engine.bundleUrl, tmp);
      await NativeZipArchive.unzip(tmp, dir);
      await NativeFile.unlink(tmp);
      await flattenWrapperDir(dir);
    }
    onProgress?.({ fraction: 1, currentFile: 'bundle.zip' });
    return;
  }

  const files = engine.files ?? [];
  const totalBytes =
    files.reduce((sum, file) => sum + (file.bytes ?? 0), 0) || 1;
  let doneBytes = 0;

  for (const file of files) {
    const target = `${dir}/${file.path}`;
    onProgress?.({ fraction: doneBytes / totalBytes, currentFile: file.path });

    if (!(await NativeFile.exists(target))) {
      if (file.unzip) {
        const tmp = `${dir}/${file.path}.zip`;
        await downloadFile(file.url, tmp);
        await NativeZipArchive.unzip(tmp, dir);
        await NativeFile.unlink(tmp);
      } else {
        await downloadFile(file.url, target);
      }
    }

    doneBytes += file.bytes ?? 0;
    onProgress?.({ fraction: doneBytes / totalBytes, currentFile: file.path });
  }
};

/**
 * If a bundle zip wrapped everything in a single top-level folder
 * (`kokoro-en-v0_19/model.onnx` …), lift that folder's contents up into `dir`
 * so the rest of the code can assume `dir/model.onnx`.
 */
const flattenWrapperDir = async (dir: string): Promise<void> => {
  if (await NativeFile.exists(`${dir}/model.onnx`)) {
    return;
  }
  let entries: { name: string; isDirectory: boolean }[];
  try {
    entries = await NativeFile.readDir(dir);
  } catch {
    return;
  }
  const subDirs = entries.filter(e => e.isDirectory);
  if (subDirs.length !== 1) {
    return;
  }
  const inner = `${dir}/${subDirs[0].name}`;
  if (!(await NativeFile.exists(`${inner}/model.onnx`))) {
    return;
  }
  for (const entry of await NativeFile.readDir(inner)) {
    await NativeFile.moveFile(`${inner}/${entry.name}`, `${dir}/${entry.name}`);
  }
  await NativeFile.unlink(inner);
};

export const uninstallEngine = async (engineId: string): Promise<void> => {
  const dir = engineDir(engineId);
  if (await NativeFile.exists(dir)) {
    await NativeFile.unlink(dir);
  }
};

/** Voices from every enabled repo whose engine bundle is fully installed. */
export const listInstalledKokoroVoices = async (): Promise<
  InstalledKokoroVoice[]
> => {
  const manifests = await fetchAllVoiceManifests();
  const out: InstalledKokoroVoice[] = [];
  for (const { manifest } of manifests) {
    if (!(await isEngineInstalled(manifest.engine))) {
      continue;
    }
    for (const voice of manifest.voices) {
      out.push({
        ...voice,
        engineId: manifest.engine.id,
        engineName: manifest.engine.name,
      });
    }
  }
  return out;
};
