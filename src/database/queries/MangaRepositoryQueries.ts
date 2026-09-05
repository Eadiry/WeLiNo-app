import { eq } from 'drizzle-orm';
import { dbManager } from '@database/db';
import {
  mangaRepositorySchema,
  type MangaRepositoryRow,
} from '@database/schema';

/** Mirrors VoiceRepositoryQueries.ts — same shape, separate table. */

export const getMangaRepositoriesFromDb = async (): Promise<
  MangaRepositoryRow[]
> => {
  return dbManager.select().from(mangaRepositorySchema).all();
};

export const getEnabledMangaRepositoriesFromDb = async (): Promise<
  MangaRepositoryRow[]
> => {
  return dbManager
    .select()
    .from(mangaRepositorySchema)
    .where(eq(mangaRepositorySchema.enabled, true))
    .orderBy(mangaRepositorySchema.id)
    .all();
};

export const isMangaRepoUrlDuplicated = async (repoUrl: string) => {
  const result = await dbManager
    .select({ count: mangaRepositorySchema.id })
    .from(mangaRepositorySchema)
    .where(eq(mangaRepositorySchema.url, repoUrl))
    .get();

  return !!result;
};

export const createMangaRepository = async (
  repoUrl: string,
): Promise<MangaRepositoryRow> => {
  const row = await dbManager.write(
    async tx =>
      await tx
        .insert(mangaRepositorySchema)
        .values({ url: repoUrl })
        .returning()
        .get(),
  );
  return row;
};

export const deleteMangaRepositoryById = async (id: number): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .delete(mangaRepositorySchema)
      .where(eq(mangaRepositorySchema.id, id))
      .run();
  });
};

export const updateMangaRepository = async (
  id: number,
  url: string,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(mangaRepositorySchema)
      .set({ url })
      .where(eq(mangaRepositorySchema.id, id))
      .run();
  });
};

export const setMangaRepositoryEnabled = async (
  id: number,
  enabled: boolean,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(mangaRepositorySchema)
      .set({ enabled })
      .where(eq(mangaRepositorySchema.id, id))
      .run();
  });
};
