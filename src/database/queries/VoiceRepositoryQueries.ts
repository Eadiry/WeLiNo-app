import { eq } from 'drizzle-orm';
import { dbManager } from '@database/db';
import {
  voiceRepositorySchema,
  type VoiceRepositoryRow,
} from '@database/schema';

export const getVoiceRepositoriesFromDb = async (): Promise<
  VoiceRepositoryRow[]
> => {
  return dbManager.select().from(voiceRepositorySchema).all();
};

export const getEnabledVoiceRepositoriesFromDb = async (): Promise<
  VoiceRepositoryRow[]
> => {
  return dbManager
    .select()
    .from(voiceRepositorySchema)
    .where(eq(voiceRepositorySchema.enabled, true))
    .orderBy(voiceRepositorySchema.id)
    .all();
};

export const isVoiceRepoUrlDuplicated = async (repoUrl: string) => {
  const result = await dbManager
    .select({ count: voiceRepositorySchema.id })
    .from(voiceRepositorySchema)
    .where(eq(voiceRepositorySchema.url, repoUrl))
    .get();

  return !!result;
};

export const createVoiceRepository = async (
  repoUrl: string,
): Promise<VoiceRepositoryRow> => {
  const row = await dbManager.write(
    async tx =>
      await tx
        .insert(voiceRepositorySchema)
        .values({ url: repoUrl })
        .returning()
        .get(),
  );
  return row;
};

export const deleteVoiceRepositoryById = async (id: number): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .delete(voiceRepositorySchema)
      .where(eq(voiceRepositorySchema.id, id))
      .run();
  });
};

export const updateVoiceRepository = async (
  id: number,
  url: string,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(voiceRepositorySchema)
      .set({ url })
      .where(eq(voiceRepositorySchema.id, id))
      .run();
  });
};

export const setVoiceRepositoryEnabled = async (
  id: number,
  enabled: boolean,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(voiceRepositorySchema)
      .set({ enabled })
      .where(eq(voiceRepositorySchema.id, id))
      .run();
  });
};
