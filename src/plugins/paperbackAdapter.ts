import { createPaperbackApplication } from './helpers/paperbackApplication';
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

export const loadPaperbackPlugin = (
  pluginId: string,
  code: string,
): MangaPlugin | undefined => {
  try {
    const application = createPaperbackApplication(pluginId);
    const registry = evalPaperbackBundle(code, application);
    const extension = registry[pluginId];
    if (!extension || typeof extension.getMangaDetails !== 'function') {
      return undefined;
    }
    return wrapPaperbackExtension(pluginId, extension);
  } catch {
    return undefined;
  }
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
): MangaPlugin {
  let cachedDiscoverSections: PBDiscoverSection[] | undefined;
  const discoverSections = async () => {
    if (!ext.getDiscoverSections) return [];
    cachedDiscoverSections ??= await ext.getDiscoverSections();
    return cachedDiscoverSections;
  };

  return {
    id: pluginId,
    name: pluginId,
    site: pluginId,
    lang: 'en',
    version: '0.0.0',
    url: '',
    iconUrl: '',
    imageRequestInit: { headers: {} },

    async popularManga(pageNo): Promise<MangaSourceItem[]> {
      const sections = await discoverSections();
      if (sections.length > 0 && ext.getDiscoverSectionItems) {
        const section = sections[0];
        const results = await ext.getDiscoverSectionItems(
          section,
          pageNo > 1 ? { page: pageNo } : undefined,
        );
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
          pageNo > 1 ? { page: pageNo } : undefined,
          undefined,
        );
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
      if (!ext.getSearchResults) return [];
      const results = await ext.getSearchResults(
        { title: searchTerm, filters: [] },
        pageNo > 1 ? { page: pageNo } : undefined,
        undefined,
      );
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
}
