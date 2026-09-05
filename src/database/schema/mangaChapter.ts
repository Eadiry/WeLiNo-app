import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Mirrors `chapter.ts` field-for-field (`novelId` → `mangaId`), plus
 * `lastPageRead` — paged-mode progress is "which page", not a scroll
 * percentage, so it's tracked separately from the inherited `progress` field
 * (used by the vertical reader, same as the novel reader's scroll-% meaning).
 */
export const mangaChapter = sqliteTable(
  'MangaChapter',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mangaId: integer('mangaId').notNull(),
    path: text('path').notNull(),
    name: text('name').notNull(),
    releaseTime: text('releaseTime'),
    bookmark: integer('bookmark', { mode: 'boolean' }).default(false),
    unread: integer('unread', { mode: 'boolean' }).default(true),
    readTime: text('readTime'),
    isDownloaded: integer('isDownloaded', { mode: 'boolean' }).default(false),
    updatedTime: text('updatedTime'),
    chapterNumber: real('chapterNumber'),
    page: text('page').default('1'),
    position: integer('position').default(0),
    progress: integer('progress'),
    lastPageRead: integer('lastPageRead').default(0),
    scanlator: text('scanlator'),
    timeSpent: integer('timeSpent').default(0),
  },
  table => [
    uniqueIndex('manga_chapter_manga_path_unique').on(
      table.mangaId,
      table.path,
    ),
    index('mangaChapterMangaIdIndex').on(
      table.mangaId,
      table.position,
      table.page,
      table.id,
    ),
  ],
);

export type MangaChapterRow = typeof mangaChapter.$inferSelect;
export type MangaChapterInsert = typeof mangaChapter.$inferInsert;
