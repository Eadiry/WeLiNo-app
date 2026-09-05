import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Mirrors `novel.ts` field-for-field, plus `readerMode` (no novel equivalent). */
export const manga = sqliteTable(
  'Manga',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    path: text('path').notNull(),
    pluginId: text('pluginId').notNull(),
    name: text('name').notNull(),
    cover: text('cover'),
    summary: text('summary'),
    author: text('author'),
    artist: text('artist'),
    status: text('status').default('Unknown'),
    genres: text('genres'),
    inLibrary: integer('inLibrary', { mode: 'boolean' }).default(false),
    isLocal: integer('isLocal', { mode: 'boolean' }).default(false),
    totalPages: integer('totalPages').default(0),
    chaptersDownloaded: integer('chaptersDownloaded').default(0),
    chaptersUnread: integer('chaptersUnread').default(0),
    totalChapters: integer('totalChapters').default(0),
    lastReadAt: text('lastReadAt'),
    lastUpdatedAt: text('lastUpdatedAt'),
    /** Per-series reader UI, switchable from the series screen. */
    readerMode: text('readerMode', { enum: ['paged', 'vertical'] })
      .notNull()
      .default('vertical'),
  },
  table => [
    uniqueIndex('manga_path_plugin_unique').on(table.path, table.pluginId),
    index('MangaIndex').on(
      table.pluginId,
      table.path,
      table.id,
      table.inLibrary,
    ),
  ],
);

export type MangaRow = typeof manga.$inferSelect;
export type MangaInsert = typeof manga.$inferInsert;
