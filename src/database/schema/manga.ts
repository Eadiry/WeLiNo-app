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
     * migration `20260905010000_widen_manga_reader_mode`, then to 6 with
     * `pagedVertical` (a real, distinct mode — discrete top-to-bottom page
     * swipes via `react-native-pager-view`'s own `orientation="vertical"`,
     * as opposed to `continuousVertical`'s smooth scroll) after a reference
     * app's reading-mode picker showed it as a separate option. No new
     * migration needed for that addition — no existing rows ever had this
     * value to rename, and this column is plain `text` with no SQL-level
     * CHECK constraint (confirmed from the real generated migration SQL),
     * so widening the TS union alone is sufficient.
     */
    readerMode: text('readerMode', {
      enum: [
        'pagedLtr',
        'pagedRtl',
        'pagedVertical',
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
