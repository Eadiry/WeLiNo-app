/**
 * The subset of the real `paperback-extensions-common` npm package (MIT,
 * v4.3.5 — downloaded and read directly, not guessed) this adapter uses.
 * Covers both bundle generations it targets: v1 (bare-global functions) and
 * 0.8 (the same functions, namespaced under `App.*`) — see
 * `paperbackLegacyAdapter.ts` for how both get the same globals.
 */

export interface Tag {
  id: string;
  label: string;
}

export interface TagSection {
  id: string;
  label: string;
  tags: Tag[];
}

/** Deliberately unusual numbering — confirmed from the real `Manga/index.d.ts`, don't "fix" it. */
export enum LegacyMangaStatus {
  ONGOING = 1,
  COMPLETED = 0,
  UNKNOWN = 2,
  ABANDONED = 3,
  HIATUS = 4,
}

export interface LegacyManga {
  titles: string[];
  image: string;
  status: LegacyMangaStatus;
  artist?: string;
  author?: string;
  desc?: string;
  tags?: TagSection[];
  hentai?: boolean;
}

export interface IconText {
  text: string;
  icon?: string;
}

export interface MangaTile {
  id: string;
  title: IconText;
  image: string;
  subtitleText?: IconText;
}

export interface PagedResults {
  results: MangaTile[];
  metadata?: unknown;
}

export interface LegacyChapter {
  id: string;
  mangaId: string;
  chapNum: number;
  langCode?: string;
  name?: string;
  volume?: number;
  time?: string | Date;
}

export interface ChapterDetails {
  id: string;
  mangaId: string;
  pages: string[];
  longStrip: boolean;
}

export interface SearchRequest {
  title?: string;
  [key: string]: unknown;
}

export interface LegacyRequestHeaders {
  [key: string]: string;
}

export interface LegacyCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
}

export interface LegacyRequest {
  url: string;
  method: string;
  metadata?: unknown;
  headers?: LegacyRequestHeaders;
  data?: unknown;
  param?: string;
  cookies?: LegacyCookie[];
  incognito?: boolean;
}

export interface LegacyResponse {
  rawData: ArrayBuffer;
  data: string;
  status: number;
  headers: LegacyRequestHeaders;
  request: LegacyRequest;
}

export interface LegacyRequestManager {
  schedule: (
    request: LegacyRequest,
    retryCount?: number,
  ) => Promise<LegacyResponse>;
  getDefaultUserAgent: () => Promise<string>;
}

/**
 * Structural, not a real base class — a v1/0.8 extension is duck-typed
 * against this after `new`ing it, same as `PaperbackExtension` is for the
 * 0.9 format.
 */
export interface LegacySource {
  requestManager: LegacyRequestManager;
  getMangaDetails: (mangaId: string) => Promise<LegacyManga>;
  getChapters: (mangaId: string) => Promise<LegacyChapter[]>;
  getChapterDetails: (
    mangaId: string,
    chapterId: string,
  ) => Promise<ChapterDetails>;
  getSearchResults?: (
    query: SearchRequest,
    metadata: unknown,
  ) => Promise<PagedResults>;
  searchRequest?: (
    query: SearchRequest,
    metadata: unknown,
  ) => Promise<PagedResults>;
}
