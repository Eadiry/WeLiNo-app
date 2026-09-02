import { category } from './category';
import { novel } from './novel';
import { chapter } from './chapter';
import { novelCategory } from './novelCategory';
import { repository } from './repository';
import { voiceRepository } from './voiceRepository';

export {
  category as categorySchema,
  type CategoryRow,
  type CategoryInsert,
} from './category';
export { novel as novelSchema, type NovelRow, type NovelInsert } from './novel';
export {
  chapter as chapterSchema,
  type ChapterRow,
  type ChapterInsert,
} from './chapter';
export {
  novelCategory as novelCategorySchema,
  type NovelCategoryRow,
  type NovelCategoryInsert,
} from './novelCategory';
export {
  repository as repositorySchema,
  type RepositoryRow,
  type RepositoryInsert,
} from './repository';
export {
  voiceRepository as voiceRepositorySchema,
  type VoiceRepositoryRow,
  type VoiceRepositoryInsert,
} from './voiceRepository';

/**
 * Unified schema object containing all database tables
 * Use this with Drizzle ORM for type-safe database operations
 */
export const schema = {
  category,
  novel,
  chapter,
  novelCategory,
  repository,
  voiceRepository,
} as const;

export type Schema = typeof schema;
