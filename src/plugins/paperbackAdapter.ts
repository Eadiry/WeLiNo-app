import {
  createPaperbackApplication,
  type PaperbackApplicationInternal,
} from './helpers/paperbackApplication';
import { loadPaperbackLegacySource } from './paperbackLegacyAdapter';
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
 * Tries the current (0.9) `Application`-global format first; if that
 * doesn't yield a working extension for `pluginId`, falls through to
 * `paperbackLegacyAdapter.ts` on the *same* fetched code — a content-based
 * fallback (same spirit as the CMS-template detector's `detect()`) rather
 * than a format flag the repository metadata or the user has to get right.
 * Real repos ship one format or the other; trying both costs nothing when
 * the first attempt fails cleanly.
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
    // Not silent: a bundle that loads but is the wrong API generation (a
    // real, confirmed failure mode — see knownPaperbackRepositories.ts)
    // throws here, and swallowing it looks identical to "not a Paperback
    // bundle at all" from the caller's side. Loud in dev; still falls
    // through to the legacy attempt below either way.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[paperbackAdapter] failed to load "${pluginId}":`, error);
    }
  }
  return loadPaperbackLegacySource(pluginId, code);
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

    async popularManga(pageNo): Promise<MangaSourceItem[]> {
      await ready;
      if (pageNo <= 1) discoverMetadataByPage = new Map();
      const { metadata, canFetch } = metadataForPage(
        discoverMetadataByPage,
        pageNo,
      );
      if (!canFetch) return [];

      // Confirmed real bug: a real source's *first* discover section is
      // typically a small curated homepage shelf (e.g. "Latest", "Featured")
      // that runs out of pages well before the site's actual catalog does —
      // "browse manga X, only ever see some of it, load-more eventually
      // stops". `getSearchResults` with a blank query is the whole-catalog
      // endpoint on virtually every real source (the legacy v1/0.8 adapter
      // already relies on exactly this for its own "popular" — see
      // `paperbackLegacyAdapter.ts`'s `search('', pageNo)`), so prefer it
      // here too and only fall back to a discover section for the rare
      // source that has sections but no search endpoint at all.
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
