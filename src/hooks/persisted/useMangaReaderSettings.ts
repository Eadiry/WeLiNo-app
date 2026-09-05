import { useMemo } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

/**
 * Global (not per-series) manga reader preferences — the per-series
 * `readerMode` lives on the `Manga` row instead. Mirrors the novel side's
 * `useChapterReaderSettings` MMKV pattern (`useSettings.ts`), kept minimal:
 * only what the Mihon-style settings sheet currently exposes.
 */
export const MANGA_READER_SETTINGS = 'MANGA_READER_SETTINGS';

export interface MangaReaderSettings {
  /** Horizontal page inset as a fraction of screen width, 0–0.25. */
  sidePadding: number;
}

const defaults: MangaReaderSettings = {
  sidePadding: 0,
};

export const useMangaReaderSettings = () => {
  const [stored, setStored] = useMMKVObject<MangaReaderSettings>(
    MANGA_READER_SETTINGS,
  );

  const settings = useMemo(() => ({ ...defaults, ...stored }), [stored]);

  const setMangaReaderSettings = (values: Partial<MangaReaderSettings>) =>
    setStored({ ...settings, ...values });

  return { ...settings, setMangaReaderSettings };
};
