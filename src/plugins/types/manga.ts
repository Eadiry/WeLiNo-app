import { FilterToValues, Filters } from './filterTypes';
import type { ImageRequestInit, PluginItem, PluginSettings } from './index';

/**
 * Manga/manhua/manhwa plugin contract — a parallel sibling to the novel
 * `Plugin` (`./index.ts`), not a variant of it. Deliberately separate: a
 * novel plugin's `parseChapter` returns prose HTML, a manga plugin's returns
 * an ordered list of page-image URLs. `PluginItem` (id/name/site/lang/
 * version/url/iconUrl/…) has no novel-specific fields, so it's reused as-is
 * for manga's repository-listing shape too.
 */

export interface MangaSourceItem {
  id: undefined;
  name: string;
  path: string;
  cover?: string;
}

export interface MangaChapterItem {
  name: string;
  path: string;
  chapterNumber?: number;
  releaseTime?: string;
  page?: string;
  scanlator?: string | string[];
}

export enum MangaStatus {
  Unknown = 'Unknown',
  Ongoing = 'Ongoing',
  Completed = 'Completed',
  Licensed = 'Licensed',
  PublishingFinished = 'Publishing Finished',
  Cancelled = 'Cancelled',
  OnHiatus = 'On Hiatus',
  STUB = 'STUB',
  Inactive = 'Inactive',
}

export interface SourceManga extends MangaSourceItem {
  genres?: string;
  summary?: string;
  author?: string;
  artist?: string;
  status?: MangaStatus;
  chapters: MangaChapterItem[];
  totalPages?: number;
}

export interface MangaSourcePage {
  chapters: MangaChapterItem[];
}

export interface PopularMangaOptions<Q extends Filters> {
  showLatestManga?: boolean;
  filters?: FilterToValues<Q>;
}

/** A chapter's pages, in reading order. */
export interface MangaChapterPages {
  pages: string[];
}

export interface MangaPlugin extends PluginItem {
  imageRequestInit: ImageRequestInit;
  filters?: Filters;
  pluginSettings?: PluginSettings;
  popularManga: (
    pageNo: number,
    options?: PopularMangaOptions<Filters>,
  ) => Promise<MangaSourceItem[]>;
  parseManga: (mangaPath: string) => Promise<SourceManga>;
  parseMangaPage?: (
    mangaPath: string,
    page: string,
  ) => Promise<MangaSourcePage>;
  parseChapter: (chapterPath: string) => Promise<MangaChapterPages>;
  searchManga: (
    searchTerm: string,
    pageNo: number,
  ) => Promise<MangaSourceItem[]>;
  resolveUrl?: (path: string, isManga?: boolean) => string;
}
