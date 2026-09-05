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
 *
 * `format` distinguishes two index shapes `fetchMangaPlugins` understands:
 * - `native`: our own `PluginItem[]` JSON, run through the plain sandbox.
 * - `paperback`: a Paperback/Inkdex `versioning.json` registry — its sources
 *   are compiled JS bundles run through the Paperback compatibility adapter
 *   (`src/plugins/paperbackAdapter.ts`) instead of a native MangaPlugin.
 */
export const mangaRepository = sqliteTable(
  'MangaRepository',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    format: text('format', { enum: ['native', 'paperback'] })
      .notNull()
      .default('native'),
  },
  table => [uniqueIndex('manga_repository_url_unique').on(table.url)],
);

export type MangaRepositoryRow = typeof mangaRepository.$inferSelect;
export type MangaRepositoryInsert = typeof mangaRepository.$inferInsert;
