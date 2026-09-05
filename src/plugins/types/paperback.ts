/**
 * Minimal re-statement of the parts of the `@paperback/types` SDK
 * (MIT-licensed, https://www.npmjs.com/package/@paperback/types) this app's
 * compatibility adapter needs — just enough to load and drive a compiled
 * Paperback/Inkdex extension bundle, not the full published surface.
 *
 * Paperback extensions are TypeScript, compiled to a single JS bundle per
 * source. The only *runtime* dependency a compiled bundle has on its host is
 * one global namespace, `Application` (declared `declare global` in the real
 * package — never exported as a module) — everything else (`SourceManga`,
 * `Chapter`, …) are compile-time-only types that leave no trace in the
 * bundle. See `src/plugins/helpers/paperbackApplication.ts` for the
 * implementation we inject in its place, and `src/plugins/paperbackAdapter.ts`
 * for how a loaded extension is wrapped as our own `MangaPlugin`.
 */

export interface PBTagSection {
  id: string;
  title: string;
  tags: { id: string; title: string }[];
}

export interface PBMangaInfo {
  thumbnailUrl: string;
  synopsis: string;
  primaryTitle: string;
  secondaryTitles?: string[];
  status?: string;
  artist?: string;
  author?: string;
  tagGroups?: PBTagSection[];
}

export interface PBSourceManga {
  mangaId: string;
  mangaInfo: PBMangaInfo;
}

export interface PBChapter {
  chapterId: string;
  sourceManga: PBSourceManga;
  langCode: string;
  chapNum: number;
  title?: string;
  volume?: number;
  publishDate?: string | Date;
  sortingIndex?: number;
}

export interface PBChapterDetails {
  id: string;
  mangaId: string;
  pages: string[];
}

export interface PBSearchResultItem {
  mangaId: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
}

export interface PBDiscoverSectionItem {
  mangaId: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
}

export interface PBDiscoverSection {
  id: string;
  title: string;
  type: number;
}

export interface PBPagedResults<T> {
  items: T[];
  metadata?: unknown;
}

export interface PBSearchQuery {
  title: string;
  filters: { id: string; value: unknown }[];
}

/**
 * The loaded extension instance — `MangaProviding` is mandatory, the rest
 * are optional capabilities the real SDK detects via `implementsXProviding`
 * helpers; we detect the same way, by checking for the methods directly.
 */
export interface PaperbackExtension {
  initialise?: () => Promise<void>;
  getMangaDetails(mangaId: string): Promise<PBSourceManga>;
  getChapters?: (
    sourceManga: PBSourceManga,
    sinceDate?: Date,
  ) => Promise<PBChapter[]>;
  getChapterDetails?: (chapter: PBChapter) => Promise<PBChapterDetails>;
  getSearchResults?: (
    query: PBSearchQuery,
    metadata: unknown,
    sortingOption: unknown,
  ) => Promise<PBPagedResults<PBSearchResultItem>>;
  getDiscoverSections?: () => Promise<PBDiscoverSection[]>;
  getDiscoverSectionItems?: (
    section: PBDiscoverSection,
    metadata: unknown,
  ) => Promise<PBPagedResults<PBDiscoverSectionItem>>;
}

export interface PBRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: ArrayBuffer | object | string;
  cookies?: Record<string, string>;
}

export interface PBResponse {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly status: number;
  readonly mimeType?: string;
  readonly cookies: unknown[];
}

export type PBRequestInterceptor = (request: PBRequest) => Promise<PBRequest>;
export type PBResponseInterceptor = (
  request: PBRequest,
  response: PBResponse,
  data: ArrayBuffer,
) => Promise<ArrayBuffer>;

/**
 * The `Application` global every compiled bundle expects to already exist —
 * see `createPaperbackApplication()` for the implementation.
 */
export interface PBApplication {
  readonly isResourceLimited: boolean;
  readonly filterAdultTitles: boolean;
  readonly filterMatureTitles: boolean;
  decodeHTMLEntities(str: string): string;
  sleep(seconds: number): Promise<void>;
  getDefaultUserAgent(): Promise<string>;
  scheduleRequest(request: PBRequest): Promise<[PBResponse, ArrayBuffer]>;
  arrayBufferToUTF8String(buf: ArrayBuffer): string;
  arrayBufferToASCIIString(buf: ArrayBuffer): string;
  arrayBufferToUTF16String(buf: ArrayBuffer): string;
  base64Encode<T extends string | ArrayBuffer>(value: T): T;
  base64Decode<T extends string | ArrayBuffer>(value: T): T;
  getState(key: string): unknown;
  setState(value: unknown, key: string): void;
  getSecureState(key: string): unknown;
  setSecureState(value: unknown, key: string): void;
  resetAllState(): void;
  invalidateDiscoverSections(): void;
  invalidateSearchFilters(): void;
  registerInterceptor(
    interceptorId: string,
    interceptRequestSelectorId: unknown,
    interceptResponseSelectorId: unknown,
  ): void;
  unregisterInterceptor(interceptorId: string): void;
  setRedirectHandler(redirectHandlerSelectorId: unknown): void;
  registerDiscoverSection(section: unknown, selector?: unknown): void;
  unregisterDiscoverSection(sectionId: string): void;
  registeredDiscoverSections(): unknown[];
  registerSearchFilter(searchFilter: unknown): void;
  unregisterSearchFilter(id: string): void;
  registeredSearchFilters(): unknown[];
  Selector<T extends object>(obj: T, key: keyof T): unknown;
  executeInWebView(context: unknown): Promise<unknown>;
}
