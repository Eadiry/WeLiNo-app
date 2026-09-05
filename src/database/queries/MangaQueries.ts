import { eq, and, desc } from 'drizzle-orm';

import { dbManager } from '@database/db';
import { mangaSchema, type MangaRow } from '@database/schema';
import type { SourceManga } from '@plugins/types/manga';
import { getMangaPlugin } from '@plugins/mangaPluginManager';
import { showToast } from '@utils/showToast';
import { getString } from '@i18n/translations';
import { insertMangaChapters } from './MangaChapterQueries';

/**
 * Manga's `NovelQueries.ts` mirror — deliberately smaller than its novel
 * counterpart for this phase: no category assignment on add (`Manga.inLibrary`
 * is a plain boolean, so a v1 library is one flat list, not per-category tabs
 * — `MangaCategory` stays unused until that's actually built), and no cover
 * download-to-disk (covers stream directly from the source URL via
 * `NovelCoverImage`, reused as-is; caching to disk is a Phase 4 concern once
 * offline downloads exist).
 */

export const fetchManga = async (
  pluginId: string,
  mangaPath: string,
): Promise<SourceManga> => {
  const plugin = getMangaPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Unknown manga plugin: ${pluginId}`);
  }
  return plugin.parseManga(mangaPath);
};

export const insertMangaAndChapters = async (
  pluginId: string,
  sourceManga: SourceManga,
): Promise<number | undefined> => {
  const result = await dbManager.write(async tx => {
    return tx
      .insert(mangaSchema)
      .values({
        path: sourceManga.path,
        pluginId,
        name: sourceManga.name,
        cover: sourceManga.cover || null,
        summary: sourceManga.summary || null,
        author: sourceManga.author || null,
        artist: sourceManga.artist || null,
        status: sourceManga.status || null,
        genres: sourceManga.genres || null,
        totalPages: sourceManga.totalPages || 0,
        totalChapters: sourceManga.chapters.length,
      })
      .onConflictDoNothing()
      .returning()
      .all();
  });

  const mangaId = result?.[0]?.id;
  if (mangaId) {
    await insertMangaChapters(mangaId, sourceManga.chapters);
  }
  return mangaId;
};

export const getMangaById = (mangaId: number): MangaRow | undefined => {
  return dbManager.getSync(
    dbManager.select().from(mangaSchema).where(eq(mangaSchema.id, mangaId)),
  );
};

export const getMangaByPath = (
  mangaPath: string,
  pluginId: string,
): MangaRow | undefined => {
  return dbManager.getSync(
    dbManager
      .select()
      .from(mangaSchema)
      .where(
        and(
          eq(mangaSchema.path, mangaPath),
          eq(mangaSchema.pluginId, pluginId),
        ),
      ),
  );
};

/**
 * Toggles a manga's library membership — mirrors
 * `NovelQueries.ts`'s `switchNovelToLibraryQuery`, minus the category-assign
 * step (see file header).
 */
export const switchMangaToLibraryQuery = async (
  mangaPath: string,
  pluginId: string,
): Promise<MangaRow | undefined> => {
  const manga = getMangaByPath(mangaPath, pluginId);
  if (manga) {
    const newInLibrary = !manga.inLibrary;
    await dbManager.write(async tx => {
      tx.update(mangaSchema)
        .set({ inLibrary: newInLibrary })
        .where(eq(mangaSchema.id, manga.id))
        .run();
    });
    showToast(
      newInLibrary
        ? getString('browseScreen.addedToLibrary')
        : getString('browseScreen.removeFromLibrary'),
    );
    return { ...manga, inLibrary: newInLibrary };
  }

  const sourceManga = await fetchManga(pluginId, mangaPath);
  const mangaId = await insertMangaAndChapters(pluginId, sourceManga);
  if (mangaId) {
    await dbManager.write(async tx => {
      tx.update(mangaSchema)
        .set({ inLibrary: true })
        .where(eq(mangaSchema.id, mangaId))
        .run();
    });
    showToast(getString('browseScreen.addedToLibrary'));
    return getMangaById(mangaId);
  }
};

export const getMangaLibraryFromDb = async (): Promise<MangaRow[]> => {
  return dbManager
    .select()
    .from(mangaSchema)
    .where(eq(mangaSchema.inLibrary, true))
    .orderBy(desc(mangaSchema.id))
    .all();
};

export const getMangaLibraryQuery = () =>
  dbManager
    .select()
    .from(mangaSchema)
    .where(eq(mangaSchema.inLibrary, true))
    .orderBy(desc(mangaSchema.id));
