import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE } from '@utils/Storages';
import { fetchChapter } from '@services/plugin/fetch';

/**
 * Chapter content HTML — the local download when it exists, otherwise fetched
 * from the plugin. Mirrors the loader in `useChapter` so the reader and the
 * TTS queue see the same source.
 */
export const readChapterHtml = async (
  pluginId: string,
  chapter: { id: number; novelId: number; path: string },
): Promise<string> => {
  const filePath = `${NOVEL_STORAGE}/${pluginId}/${chapter.novelId}/${chapter.id}/index.html`;
  try {
    return await NativeFile.readFile(filePath);
  } catch {
    return fetchChapter(pluginId, chapter.path);
  }
};
