import {
  createPaperbackApplication,
  type PaperbackApplicationInternal,
} from './helpers/paperbackApplication';
import {
  MangaStatus,
  type MangaChapterItem,
  type MangaChapterPages,
  type MangaPlugin,
  type MangaSourceItem,
  type SourceManga,
} from './types/manga';
import type { PluginItem } from './types';
import type {
  PaperbackExtension,
  PBChapter,
  PBDiscoverSection,
  PBSourceManga,
} from './types/paperback';
import { FilterTypes, isXCheckboxValue } from './types/filterTypes';

/** Single, fixed key under which a Paperback source's genre/tag filter is
 * exposed on `MangaPlugin.filters` — there is only ever one such filter
 * per source (`getSearchTags()` returns one flat list of tag sections). */
const GENRE_FILTER_KEY = 'tags';

/**
 * Compatibility layer for Paperback/Inkdex extensions — compiled JS bundles
 * built against the (MIT-licensed) `@paperback/types` SDK. See
 * `helpers/paperbackApplication.ts` for why only one global (`Application`)
 * needs to be injected, and `docs/` — no, see the manga feature plan — for
 * the full research trail. This file has two jobs:
 *
 * 1. `fetchPaperbackRepositoryPlugins` — turn a repo's `versioning.json` into
 *    the `PluginItem[]` shape `mangaPluginManager` already knows how to
 *    install/cache (its `url` points at the source's compiled bundle, so the
 *    existing download/persist code needs no changes).
 * 2. `loadPaperbackPlugin` — evaluate a downloaded bundle and wrap the
 *    resulting extension instance as our own `MangaPlugin`.
 *
 * Known v1 limitations (disclosed, not silently swallowed):
 * - Only covers what `helpers/paperbackApplication.ts` implements. Sources
 *   needing `executeInWebView` (Cloudflare/JS-challenge bypass) will fail
 *   that request cleanly rather than hang.
 * - "Popular" is approximated from the extension's first discover section
 *   (or a blank search, if it has none) — Paperback's home screen is
 *   multi-section, ours is one flat paged list, so this is a simplification,
 *   not a full translation.
 * - Chapter identity is round-tripped through `MangaChapterItem.path` as
 *   `JSON.stringify({ mangaId, chapterId })`, since our `parseChapter` takes
 *   a bare path string but Paperback's `getChapterDetails` needs a `Chapter`
 *   object. The stub `Chapter`/`SourceManga` this reconstructs carries only
 *   the two ids — enough for every source that doesn't read other chapter
 *   fields inside `getChapterDetails`, which is the common case.
 */

interface PaperbackRegistrySource {
  id: string;
  name: string;
  description?: string;
  version: string;
  icon?: string;
  language?: string;
}

interface PaperbackRegistry {
  sources: PaperbackRegistrySource[];
}

/** `https://host/path/versioning.json` -> `https://host/path` */
const repoBaseUrl = (registryUrl: string) =>
  registryUrl.replace(/\/[^/]*$/, '');

export const fetchPaperbackRepositoryPlugins = async (
  registryUrl: string,
): Promise<PluginItem[]> => {
  const res = await fetch(registryUrl);
  if (!res.ok) {
    throw new Error(`Registry request failed (${res.status}).`);
  }
  const registry = (await res.json()) as PaperbackRegistry;
  const base = repoBaseUrl(registryUrl);
  return registry.sources.map(source => ({
    id: source.id,
    name: source.name,
    site: source.name,
    lang: source.language ?? 'en',
    version: source.version,
    url: `${base}/${source.id}/index.js`,
    iconUrl: `${base}/${source.id}/static/${source.icon ?? 'icon.png'}`,
  }));
};

/**
 * Evaluates a compiled bundle. Bundles are self-contained IIFEs —
 * `var source = (function (e) { ...; return e.SomeId = new SomeClass, e })
 * ({})` — not our own `require()`/`module.exports` convention, so this is a
 * dedicated, much smaller eval than `createSandbox`: the only thing a bundle
 * references from its environment is the injected `Application` global.
 */
const evalPaperbackBundle = (
  code: string,
  application: unknown,
): Record<string, PaperbackExtension> => {
  /* eslint no-new-func: "off", curly: "error" */
  const registry = Function(
    'Application',
    `${code}
    return typeof source !== 'undefined' ? source : {};`,
  )(application);
  return registry ?? {};
};

/**
 * Loads a compiled 0.9-format Paperback/Inkdex bundle. Older v1/0.8
 * bundle-format support has been removed — every known repository this app
 * suggests (see `knownPaperbackRepositories.ts`) is confirmed to publish a
 * genuine 0.9-toolchain bundle.
 */
export const loadPaperbackPlugin = (
  pluginId: string,
  code: string,
): MangaPlugin | undefined => {
  try {
    const application = createPaperbackApplication(pluginId);
    const registry = evalPaperbackBundle(code, application);
    const extension = registry[pluginId];
    if (extension && typeof extension.getMangaDetails === 'function') {
      return wrapPaperbackExtension(pluginId, extension, application);
    }
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[paperbackAdapter] failed to load "${pluginId}":`, error);
    }
  }
  return undefined;
};

const mapStatus = (status?: string): MangaStatus => {
  switch (status?.toLowerCase()) {
    case 'ongoing':
      return MangaStatus.Ongoing;
    case 'completed':
    case 'complete':
      return MangaStatus.Completed;
    case 'hiatus':
      return MangaStatus.OnHiatus;
    case 'cancelled':
    case 'canceled':
      return MangaStatus.Cancelled;
    default:
      return MangaStatus.Unknown;
  }
};

const toSourceManga = (mangaId: string, source: PBSourceManga): SourceManga => {
  const info = source.mangaInfo;
  return {
    id: undefined,
    name: info.primaryTitle,
    path: mangaId,
    cover: info.thumbnailUrl,
    summary: info.synopsis,
    author: info.author,
    artist: info.artist,
    status: mapStatus(info.status),
    genres: info.tagGroups
      ?.flatMap(group => group.tags.map(tag => tag.title))
      .join(', '),
    chapters: [],
  };
};

const toChapterItem = (chapter: PBChapter): MangaChapterItem => ({
  name: chapter.title || `Chapter ${chapter.chapNum}`,
  path: JSON.stringify({
    mangaId: chapter.sourceManga.mangaId,
    chapterId: chapter.chapterId,
  }),
  chapterNumber: chapter.chapNum,
  releaseTime: chapter.publishDate
    ? new Date(chapter.publishDate).toISOString()
    : undefined,
});

/** Enough of a `Chapter`/`SourceManga` for `getChapterDetails` to work off. */
const chapterStub = (mangaId: string, chapterId: string): PBChapter => ({
  chapterId,
  sourceManga: {
    mangaId,
    mangaInfo: {
      thumbnailUrl: '',
      synopsis: '',
      primaryTitle: '',
    },
  },
  langCode: 'en',
  chapNum: 0,
});

function wrapPaperbackExtension(
  pluginId: string,
  ext: PaperbackExtension,
  application: PaperbackApplicationInternal,
): MangaPlugin {
  // Real extensions register their request interceptors inside
  // `initialise()` — e.g. a confirmed real bundle: `async initialise(){
  // this.someInterceptor.registerInterceptor() }`. Skipping this call is a
  // confirmed real failure mode: the extension loads and its methods can be
  // called, but requests go out missing whatever the interceptor adds
  // (cookies, rate limiting, auth), so results come back empty or wrong
  // without ever throwing. Kicked off once here rather than in
  // `loadPaperbackPlugin` so that function can stay synchronous (matching
  // every other plugin loader in this codebase) — every exposed method
  // below awaits `ready` first instead.
  //
  // Once interceptors are registered, also resolve a default set of *image*
  // headers from them (see `__resolveDefaultImageHeaders`'s doc comment) and
  // merge them into the returned plugin's `imageRequestInit` in place — the
  // object reference React components hold onto is mutated once shortly
  // after load, well before any image actually gets requested.
  // Declared before `plugin` (assigned below) since this closure runs later,
  // asynchronously — by the time it actually executes, `plugin` is set. Must
  // stay `let`: it's assigned once, but not at declaration time, so `const`
  // isn't syntactically valid here.
  // eslint-disable-next-line prefer-const
  let plugin: MangaPlugin;
  const ready = (ext.initialise?.() ?? Promise.resolve())
    .then(async () => {
      const headers = await application.__resolveDefaultImageHeaders();
      Object.assign(plugin.imageRequestInit.headers, headers);
    })
    .then(async () => {
      // Confirmed real usage (MangaDex, Netsky's community BatoTo):
      // `getSearchTags()` returns the genre/tag sections a source's own
      // `getSearchResults` reads `includedTags`/`excludedTags` from — the
      // actual filtering mechanism real sources implement, NOT
      // `Application.registerSearchFilter` (never called by any real
      // downloaded bundle checked). `plugin.filters` starts undefined
      // (this call is async, unlike a bundle's synchronous shape) and is
      // mutated in place once resolved — the browse screen re-reads
      // `plugin.filters` after each fetch, same as the novel side does.
      if (!ext.getSearchTags) return;
      const sections = await ext.getSearchTags();
      const options = sections.flatMap(section =>
        section.tags.map(tag => ({
          label: `${section.title}: ${tag.title}`,
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
    })
    .catch(() => {});

  let cachedDiscoverSections: PBDiscoverSection[] | undefined;
  const discoverSections = async () => {
    if (!ext.getDiscoverSections) return [];
    cachedDiscoverSections ??= await ext.getDiscoverSections();
    return cachedDiscoverSections;
  };

  // Paperback's pagination "metadata" is an opaque continuation cursor the
  // extension itself returns — not a page number. Confirmed real bug from
  // this: sending a fabricated `{ page: pageNo }` as metadata isn't
  // recognized by real extensions, so they just re-return page 1 every
  // time, no matter what pageNo is asked for — scrolling looked like it
  // loaded more but was actually just repeating the same first batch.
  // Fixed by caching "the metadata needed to fetch page N" as pages are
  // fetched sequentially (page N's *response* metadata is exactly what page
  // N+1 needs to ask for) — correct as long as pages are requested in
  // order, which is the only way `MangaSourceScreen.tsx` ever calls this.
  let discoverMetadataByPage = new Map<number, unknown>();
  let searchMetadataByPage = new Map<number, unknown>();
  let lastSearchTerm: string | undefined;

  const metadataForPage = (
    cache: Map<number, unknown>,
    pageNo: number,
  ): { metadata: unknown; canFetch: boolean } => {
    if (pageNo <= 1) return { metadata: undefined, canFetch: true };
    return cache.has(pageNo)
      ? { metadata: cache.get(pageNo), canFetch: true }
      : { metadata: undefined, canFetch: false };
  };

  plugin = {
    id: pluginId,
    name: pluginId,
    site: pluginId,
    lang: 'en',
    version: '0.0.0',
    url: '',
    iconUrl: '',
    imageRequestInit: { headers: {} },

    async popularManga(pageNo, options): Promise<MangaSourceItem[]> {
      await ready;
      if (pageNo <= 1) discoverMetadataByPage = new Map();
      const { metadata, canFetch } = metadataForPage(
        discoverMetadataByPage,
        pageNo,
      );
      if (!canFetch) return [];

      // A selected genre filter routes through getSearchResults with a
      // blank title instead of a discover section — discover sections have
      // no tag-filtering concept in the Paperback SDK, only search does
      // (confirmed live: BatoTo builds its filtered-browse URL from
      // `query.includedTags`, independent of `query.title`). Whether a
      // *specific* source's own getSearchResults honors includedTags on a
      // blank title is up to that source's implementation — same caveat as
      // the blank-search-for-popular regression below, not something this
      // adapter can control.
      const genreFilter = options?.filters?.[GENRE_FILTER_KEY];
      const genreValue =
        genreFilter && isXCheckboxValue(genreFilter)
          ? genreFilter.value
          : undefined;
      const hasSelectedTags =
        (genreValue?.include?.length ?? 0) > 0 ||
        (genreValue?.exclude?.length ?? 0) > 0;
      if (hasSelectedTags && genreValue && ext.getSearchResults) {
        const value = genreValue;
        const results = await ext.getSearchResults(
          {
            title: '',
            filters: [],
            includedTags: value.include?.map(id => ({ id })),
            excludedTags: value.exclude?.map(id => ({ id })),
          },
          metadata,
          undefined,
        );
        if (results.metadata !== undefined) {
          discoverMetadataByPage.set(pageNo + 1, results.metadata);
        }
        return results.items.map(item => ({
          id: undefined,
          name: item.title,
          path: item.mangaId,
          cover: item.imageUrl,
        }));
      }

      // REVERTED (confirmed real regression): a prior version of this
      // preferred `getSearchResults` with a blank query over a discover
      // section, reasoning that discover sections are often a small curated
      // homepage shelf. That reasoning doesn't hold in general — confirmed
      // from a real downloaded bundle (Inkdex's Webtoon):
      // `getSearchResults` there is
      // `query.title ? this.getTitlesByKeyword(...) : Promise.resolve({items:[]})`
      // — a blank title deterministically returns ZERO items, before any
      // network call even happens. Treating "blank search" as "whole
      // catalog" is not a safe assumption across real sources; it broke
      // Popular entirely for Webtoon (and likely others with the same
      // sensible "blank query = no results" convention). Discover sections
      // are the real, intended "Popular" mechanism in the Paperback SDK —
      // use them first, and only fall back to a blank-query search for a
      // source that exposes no discover sections at all.
      const sections = await discoverSections();
      if (sections.length > 0 && ext.getDiscoverSectionItems) {
        const section = sections[0];
        const results = await ext.getDiscoverSectionItems(section, metadata);
        if (results.metadata !== undefined) {
          discoverMetadataByPage.set(pageNo + 1, results.metadata);
        }
        return results.items.map(item => ({
          id: undefined,
          name: item.title,
          path: item.mangaId,
          cover: item.imageUrl,
        }));
      }
      if (ext.getSearchResults) {
        const results = await ext.getSearchResults(
          { title: '', filters: [] },
          metadata,
          undefined,
        );
        if (results.metadata !== undefined) {
          discoverMetadataByPage.set(pageNo + 1, results.metadata);
        }
        return results.items.map(item => ({
          id: undefined,
          name: item.title,
          path: item.mangaId,
          cover: item.imageUrl,
        }));
      }
      return [];
    },

    async searchManga(searchTerm, pageNo): Promise<MangaSourceItem[]> {
      await ready;
      if (!ext.getSearchResults) return [];
      if (searchTerm !== lastSearchTerm || pageNo <= 1) {
        lastSearchTerm = searchTerm;
        searchMetadataByPage = new Map();
      }
      const { metadata, canFetch } = metadataForPage(
        searchMetadataByPage,
        pageNo,
      );
      if (!canFetch) return [];

      const results = await ext.getSearchResults(
        { title: searchTerm, filters: [] },
        metadata,
        undefined,
      );
      if (results.metadata !== undefined) {
        searchMetadataByPage.set(pageNo + 1, results.metadata);
      }
      return results.items.map(item => ({
        id: undefined,
        name: item.title,
        path: item.mangaId,
        cover: item.imageUrl,
      }));
    },

    async parseManga(mangaId): Promise<SourceManga> {
      const pbSourceManga = await ext.getMangaDetails(mangaId);
      const manga = toSourceManga(mangaId, pbSourceManga);
      if (ext.getChapters) {
        const chapters = await ext.getChapters(pbSourceManga);
        manga.chapters = chapters.map(toChapterItem);
      }
      return manga;
    },

    async parseChapter(chapterPath): Promise<MangaChapterPages> {
      if (!ext.getChapterDetails) {
        throw new Error(`${pluginId} does not support reading chapters.`);
      }
      const { mangaId, chapterId } = JSON.parse(chapterPath) as {
        mangaId: string;
        chapterId: string;
      };
      const details = await ext.getChapterDetails(
        chapterStub(mangaId, chapterId),
      );
      return { pages: details.pages };
    },
  };
  return plugin;
}
