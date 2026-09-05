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
    /**
     * Per-series reader UI, switchable from the series screen.
     * `continuousVertical` is the original "vertical" mode, kept as the
     * default so existing libraries don't change behavior; `pagedLtr` is
     * the original "paged" mode. Widened from a 2-value union to 5 in
     * migration `20260905010000_widen_manga_reader_mode` (a data rename
     * only — this column is plain `text` with no SQL-level CHECK
     * constraint, so widening the TS union alone would have worked, but
     * renaming the stored values keeps them self-descriptive going
     * forward instead of carrying a permanent `'vertical'` alias).
     */
    readerMode: text('readerMode', {
      enum: [
        'pagedLtr',
        'pagedRtl',
        'continuousVertical',
        'continuousLtr',
        'continuousRtl',
      ],
    })
      .notNull()
      .default('continuousVertical'),
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
