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
 * A `voices.json` manifest:
 *
 * ```json
 * {
 *   "engine": {
 *     "id": "kokoro-multi-lang-v1_0",
 *     "name": "Kokoro 82M",
 *     "format": "sherpa-onnx-kokoro",
 *     "files": [
 *       { "path": "model.onnx",         "url": "https://…/model.onnx",         "bytes": 90000000 },
 *       { "path": "tokens.txt",         "url": "https://…/tokens.txt",         "bytes": 5000 },
 *       { "path": "voices.bin",         "url": "https://…/voices.bin",         "bytes": 27000000 },
 *       { "path": "espeak-ng-data",     "url": "https://…/espeak-ng-data.zip", "bytes": 8000000, "unzip": true }
 *     ]
 *   },
 *   "voices": [
 *     { "id": "af_heart", "name": "Heart (US female)", "language": "en-US", "speakerId": 0 }
 *   ]
 * }
 * ```
 *
 * `unzip` files are downloaded then extracted into the engine directory (the
 * archive is expected to contain a top-level folder matching `path`).
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
  files: VoiceManifestFile[];
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
  if (!Array.isArray(engine.files) || engine.files.length === 0) {
    throw new Error('Manifest engine has no "files".');
  }
  for (const file of engine.files) {
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

/** All the plain files an installed bundle must contain (unzip dirs excluded). */
const requiredFilePaths = (engine: VoiceManifestEngine) =>
  engine.files.map(file => `${engineDir(engine.id)}/${file.path}`);

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

  const totalBytes =
    engine.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0) || 1;
  let doneBytes = 0;

  for (const file of engine.files) {
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
