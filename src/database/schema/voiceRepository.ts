import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * A repository of on-device TTS voices (currently Kokoro), mirroring the plugin
 * `Repository` table. `url` points at a `voices.json` manifest.
 */
export const voiceRepository = sqliteTable(
  'VoiceRepository',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  table => [uniqueIndex('voice_repository_url_unique').on(table.url)],
);

export type VoiceRepositoryRow = typeof voiceRepository.$inferSelect;
export type VoiceRepositoryInsert = typeof voiceRepository.$inferInsert;
