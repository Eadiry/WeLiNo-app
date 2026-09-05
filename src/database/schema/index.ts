import { category } from './category';
import { novel } from './novel';
import { chapter } from './chapter';
import { novelCategory } from './novelCategory';
import { repository } from './repository';
import { voiceRepository } from './voiceRepository';
import { nameSubstitution } from './nameSubstitution';
import { manga } from './manga';
import { mangaChapter } from './mangaChapter';
import { mangaCategory } from './mangaCategory';
import { mangaRepository } from './mangaRepository';

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
export {
  nameSubstitution as nameSubstitutionSchema,
  type NameSubstitutionRow,
  type NameSubstitutionInsert,
} from './nameSubstitution';
export { manga as mangaSchema, type MangaRow, type MangaInsert } from './manga';
export {
  mangaChapter as mangaChapterSchema,
  type MangaChapterRow,
  type MangaChapterInsert,
} from './mangaChapter';
export {
  mangaCategory as mangaCategorySchema,
  type MangaCategoryRow,
  type MangaCategoryInsert,
} from './mangaCategory';
export {
  mangaRepository as mangaRepositorySchema,
  type MangaRepositoryRow,
  type MangaRepositoryInsert,
} from './mangaRepository';

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
  nameSubstitution,
  manga,
  mangaChapter,
  mangaCategory,
  mangaRepository,
} as const;

export type Schema = typeof schema;
