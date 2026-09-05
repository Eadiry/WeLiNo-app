import { integer, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Mirrors `novelCategory.ts` (`novelId` → `mangaId`). */
export const mangaCategory = sqliteTable(
  'MangaCategory',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mangaId: integer('mangaId').notNull(),
    categoryId: integer('categoryId').notNull(),
  },
  table => [
    uniqueIndex('manga_category_unique').on(table.mangaId, table.categoryId),
  ],
);

export type MangaCategoryRow = typeof mangaCategory.$inferSelect;
export type MangaCategoryInsert = typeof mangaCategory.$inferInsert;
