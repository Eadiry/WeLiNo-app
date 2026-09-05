import { eq, asc, sql } from 'drizzle-orm';

import { dbManager } from '@database/db';
import { mangaChapterSchema, type MangaChapterRow } from '@database/schema';
import type { MangaChapterItem } from '@plugins/types/manga';

/**
 * Manga's chapter-insert — mirrors `ChapterQueries.ts`'s `insertChapters`
 * field-for-field (`novelId` → `mangaId`), trimmed to a plain
 * insert-or-ignore for v1: nothing re-syncs an already-known chapter's
 * metadata yet (no download/read-tracking UI exists to make that worth
 * getting right before Phase 3/4 land).
 */
export const insertMangaChapters = async (
  mangaId: number,
  chapters?: MangaChapterItem[],
): Promise<void> => {
  if (!chapters?.length) {
    return;
  }

  const rows = chapters.map((c, index) => {
    let scanlatorStr: string | null = null;
    if (c.scanlator) {
      scanlatorStr = Array.isArray(c.scanlator)
        ? c.scanlator.filter(Boolean).join(', ')
        : c.scanlator;
    }
    return {
      path: c.path,
      name: c.name || `Chapter ${index + 1}`,
      releaseTime: c.releaseTime ?? null,
      mangaId,
      chapterNumber: c.chapterNumber ?? index + 1,
      page: c.page ?? '1',
      position: index,
      scanlator: scanlatorStr,
    };
  });

  await dbManager.batch(rows, (tx, ph) =>
    tx
      .insert(mangaChapterSchema)
      .values({
        path: ph('path'),
        name: ph('name'),
        releaseTime: ph('releaseTime'),
        mangaId: ph('mangaId'),
        chapterNumber: ph('chapterNumber'),
        page: ph('page'),
        position: ph('position'),
        scanlator: ph('scanlator'),
      })
      // `.onConflictDoNothing()` doesn't type-check against `dbManager.batch`'s
      // `SQLitePreparedQuery` return type (a drizzle typing quirk) — a no-op
      // update on conflict gets the same "insert or ignore" behavior while
      // matching the type `ChapterQueries.ts`'s `onConflictDoUpdate` call
      // already relies on.
      .onConflictDoUpdate({
        target: [mangaChapterSchema.mangaId, mangaChapterSchema.path],
        set: { path: sql`excluded.path` },
      })
      .prepare(),
  );
};

export const getMangaChaptersFromDb = async (
  mangaId: number,
): Promise<MangaChapterRow[]> => {
  return dbManager
    .select()
    .from(mangaChapterSchema)
    .where(eq(mangaChapterSchema.mangaId, mangaId))
    .orderBy(asc(mangaChapterSchema.position))
    .all();
};
