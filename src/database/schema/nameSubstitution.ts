import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A per-novel character-name find/replace rule. Applied, in `position` order,
 * to a chapter's text before it reaches the reader WebView. See
 * `src/services/nameSubstitution.ts`.
 */
export const nameSubstitution = sqliteTable(
  'NameSubstitution',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    novelId: integer('novelId').notNull(),
    pattern: text('pattern').notNull(),
    replacement: text('replacement').notNull().default(''),
    /** 'plain' (literal) or 'regex' (pattern is a RegExp source). */
    kind: text('kind').notNull().default('plain'),
    wholeWord: integer('wholeWord', { mode: 'boolean' })
      .notNull()
      .default(true),
    caseSensitive: integer('caseSensitive', { mode: 'boolean' })
      .notNull()
      .default(false),
    preserveCase: integer('preserveCase', { mode: 'boolean' })
      .notNull()
      .default(true),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    position: integer('position').notNull().default(0),
    note: text('note'),
  },
  table => [index('name_substitution_novel').on(table.novelId)],
);

export type NameSubstitutionRow = typeof nameSubstitution.$inferSelect;
export type NameSubstitutionInsert = typeof nameSubstitution.$inferInsert;
