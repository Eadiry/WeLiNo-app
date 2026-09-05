import { load } from 'cheerio';

import { createPaperbackLegacyGlobals } from './helpers/paperbackLegacyGlobals';
import { MangaStatus, type MangaPlugin, type SourceManga } from './types/manga';
import {
  LegacyMangaStatus,
  type ChapterDetails,
  type LegacyChapter,
  type LegacyManga,
  type LegacySource,
  type PagedResults,
} from './types/paperbackLegacy';
import { FilterTypes, isXCheckboxValue } from './types/filterTypes';

/** Same fixed key `paperbackAdapter.ts` uses — there is only ever one
 * genre/tag filter per source (`getSearchTags()` returns one flat list). */
const GENRE_FILTER_KEY = 'tags';

/**
 * Adapter for the two Paperback bundle generations that predate the current
 * `Application`-global format `paperbackAdapter.ts` handles — confirmed
 * against real downloaded bundles and the real, MIT-licensed
 * `paperback-extensions-common` npm package (v4.3.5):
 *
 * - **v1** (Browserify UMD, e.g. NMN's/GameFuzzy's repos): free-variable
 *   globals (`createRequestManager(...)`, bare).
 * - **0.8** (esbuild, e.g. Netsky's repos): the *same* functions, namespaced
 *   under `App.*` (`App.createRequestManager(...)`).
 *
 * Rather than detect which one a bundle is, `evalPaperbackLegacyBundle`
 * injects every global both ways — as a bare `Function(...)` parameter and
 * as a property on an `App` object also passed in — so either convention
 * just resolves. Both formats export the extension as a **class**, not an
 * instance (`new Sources[pluginId](cheerio)` — confirmed from the real
 * `Source` base class's `constructor(cheerio: CheerioAPI)`), unlike the 0.9
 * format's `e.SomeId = new SomeClass`.
 */

const evalPaperbackLegacyBundle = (
  code: string,
  globals: Record<string, unknown>,
): Record<string, new (cheerio: unknown) => LegacySource> => {
  const globalNames = Object.keys(globals);
  const globalValues = globalNames.map(name => globals[name]);
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };

  /* eslint no-new-func: "off", curly: "error" */
  const fn = Function(
    'module',
    'exports',
    'require',
    'App',
    ...globalNames,
    code,
  );
  // Real 0.8 bundles have a top-level `"use strict"` directive and reference
  // a bare top-level `this` (`this.Sources = ...`) — under strict mode a
  // bare call leaves `this` as `undefined`, which throws. An explicit
  // receiver sidesteps that; nothing reads it back afterward, since the
  // same line also assigns to the `module.exports` we do read.
  fn.call(
    {},
    moduleObj,
    moduleObj.exports,
    () => undefined,
    globals,
    ...globalValues,
  );

  // v1's UMD wrapper takes the CommonJS branch and sets `module.exports` to
  // the entry module's own exports directly (the plugin class lives at
  // `exports[pluginId]`); 0.8 explicitly nests it one level under `.Sources`.
  // Checking both covers either without needing to know which format this is.
  const nested = moduleObj.exports.Sources as
    | Record<string, unknown>
    | undefined;
  return (nested ?? moduleObj.exports) as Record<
    string,
    new (cheerio: unknown) => LegacySource
  >;
};

export const loadPaperbackLegacySource = (
  pluginId: string,
  code: string,
): MangaPlugin | undefined => {
  try {
    const globals = createPaperbackLegacyGlobals(pluginId, code);
    const registry = evalPaperbackLegacyBundle(code, globals);
    const SourceClass = registry[pluginId];
    if (typeof SourceClass !== 'function') {
      return undefined;
    }
    const instance = new SourceClass({ load });
    if (typeof instance.getMangaDetails !== 'function') {
      return undefined;
    }
    return wrapLegacySource(pluginId, instance);
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[paperbackLegacyAdapter] failed to load "${pluginId}":`,
        error,
      );
    }
    return undefined;
  }
};

const mapStatus = (status: LegacyMangaStatus): MangaStatus => {
  switch (status) {
    case LegacyMangaStatus.ONGOING:
      return MangaStatus.Ongoing;
    case LegacyMangaStatus.COMPLETED:
      return MangaStatus.Completed;
    case LegacyMangaStatus.ABANDONED:
      return MangaStatus.Cancelled;
    case LegacyMangaStatus.HIATUS:
      return MangaStatus.OnHiatus;
    default:
      return MangaStatus.Unknown;
  }
};

const toSourceManga = (mangaId: string, manga: LegacyManga): SourceManga => ({
  id: undefined,
  name: manga.titles[0] ?? mangaId,
  path: mangaId,
  cover: manga.image,
  summary: manga.desc,
  author: manga.author,
  artist: manga.artist,
  status: mapStatus(manga.status),
  genres: manga.tags
    ?.flatMap(section => section.tags.map(tag => tag.label))
    .join(', '),
  chapters: [],
});

const toChapterItem = (chapter: LegacyChapter) => ({
  name: chapter.name || `Chapter ${chapter.chapNum}`,
  path: JSON.stringify({ mangaId: chapter.mangaId, chapterId: chapter.id }),
  chapterNumber: chapter.chapNum,
  releaseTime: chapter.time ? new Date(chapter.time).toISOString() : undefined,
});

function wrapLegacySource(pluginId: string, ext: LegacySource): MangaPlugin {
  const search = (
    title: string,
    pageNo: number,
    includedTags?: string[],
    excludedTags?: string[],
  ): Promise<PagedResults> | undefined => {
    const fn = ext.getSearchResults ?? ext.searchRequest;
    return fn?.call(
      ext,
      {
        title,
        includedTags: includedTags?.map(id => ({ id })),
        excludedTags: excludedTags?.map(id => ({ id })),
      },
      pageNo > 1 ? { page: pageNo } : null,
    );
  };

  // eslint-disable-next-line prefer-const
  let plugin: MangaPlugin;
  // Confirmed real usage (Netsky's community BatoTo): `getSearchTags()`
  // returns the genre/tag sections its own `getSearchResults` reads
  // `includedTags` from. No `ready`/`initialise()` concept exists in this
  // SDK generation to piggyback on (unlike the 0.9 adapter), so this is a
  // fire-and-forget population, same mutate-in-place pattern.
  Promise.resolve().then(async () => {
    if (!ext.getSearchTags) return;
    try {
      const sections = await ext.getSearchTags();
      const options = sections.flatMap(section =>
        section.tags.map(tag => ({
          label: `${section.label}: ${tag.label}`,
          value: tag.id,
        })),
      );
      if (options.length === 0) return;
      plugin.filters = {
        [GENRE_FILTER_KEY]: {
          type: FilterTypes.ExcludableCheckboxGroup,
          label: 'Genres',
          options,
          value: {},
        },
      };
    } catch {
      // Filters are a nice-to-have on top of a working plugin — a failure
      // here must not affect browsing/reading.
    }
  });

  plugin = {
    id: pluginId,
    name: pluginId,
    site: pluginId,
    lang: 'en',
    version: '0.0.0',
    url: '',
    iconUrl: '',
    imageRequestInit: { headers: {} },

    async popularManga(pageNo, options) {
      // Same "approximate popular via a blank search" simplification the
      // 0.9 adapter uses — this SDK's actual home-page mechanism
      // (getHomePageSections) is a multi-section callback API our one flat
      // paged list doesn't map onto cleanly.
      const genreFilter = options?.filters?.[GENRE_FILTER_KEY];
      const genreValue =
        genreFilter && isXCheckboxValue(genreFilter)
          ? genreFilter.value
          : undefined;
      const results = await search(
        '',
        pageNo,
        genreValue?.include,
        genreValue?.exclude,
      );
      return (results?.results ?? []).map(item => ({
        id: undefined,
        name: item.title.text,
        path: item.id,
        cover: item.image,
      }));
    },

    async searchManga(searchTerm, pageNo) {
      const results = await search(searchTerm, pageNo);
      return (results?.results ?? []).map(item => ({
        id: undefined,
        name: item.title.text,
        path: item.id,
        cover: item.image,
      }));
    },

    async parseManga(mangaId): Promise<SourceManga> {
      const manga = await ext.getMangaDetails(mangaId);
      const sourceManga = toSourceManga(mangaId, manga);
      const chapters = await ext.getChapters(mangaId);
      sourceManga.chapters = chapters.map(toChapterItem);
      return sourceManga;
    },

    async parseChapter(chapterPath) {
      const { mangaId, chapterId } = JSON.parse(chapterPath) as {
        mangaId: string;
        chapterId: string;
      };
      const details: ChapterDetails = await ext.getChapterDetails(
        mangaId,
        chapterId,
      );
      return { pages: details.pages };
    },
  };
  return plugin;
}
