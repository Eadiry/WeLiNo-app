import NativeFile from '@modules/native-file';

const documentStorage =
  NativeFile.DocumentDirectoryPath || NativeFile.ExternalDirectoryPath;

export const ROOT_STORAGE = NativeFile.ExternalDirectoryPath || documentStorage;
export const LEGACY_PLUGIN_STORAGE = ROOT_STORAGE + '/Plugins';
export const PLUGIN_STORAGE = documentStorage + '/Plugins';
export const NOVEL_STORAGE = ROOT_STORAGE + '/Novels';
/** On-device TTS engine bundles (Kokoro model + voices), one dir per engine id. */
export const TTS_STORAGE = documentStorage + '/TTS';
/** Manga plugin bundles — separate from PLUGIN_STORAGE (different contract). */
export const MANGA_PLUGIN_STORAGE = documentStorage + '/MangaPlugins';
/** Downloaded manga chapter page images. */
export const MANGA_STORAGE = ROOT_STORAGE + '/Manga';
