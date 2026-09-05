import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * A repository of manga/manhua plugin sources — the same shape as the novel
 * `Repository` table and `voiceRepository.ts`, kept separate because manga
 * plugins are a wholly different contract (see `src/plugins/types/manga.ts`)
 * distributed via their own repo JSON manifests.
 */
export const mangaRepository = sqliteTable(
  'MangaRepository',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  table => [uniqueIndex('manga_repository_url_unique').on(table.url)],
);

export type MangaRepositoryRow = typeof mangaRepository.$inferSelect;
export type MangaRepositoryInsert = typeof mangaRepository.$inferInsert;
