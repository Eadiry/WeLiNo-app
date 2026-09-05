import {
  fetchPaperbackRepositoryPlugins,
  loadPaperbackPlugin,
} from '../paperbackAdapter';
import { FilterTypes } from '../types/filterTypes';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'WeLiNo test',
}));

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(),
    remove: jest.fn(),
    getAllKeys: jest.fn(() => []),
  }),
}));

// A minimal stand-in for a real compiled Paperback bundle: the same
// `var source = (function (e) { ...; return e.<id> = new X, e })({})`
// convention real bundles use (confirmed against a real MangaDex build), just
// with trivial method bodies instead of real scraping logic.
const TEST_BUNDLE = `
var source = (function (e) {
  class TestExtension {
    async getMangaDetails(mangaId) {
      return {
        mangaId,
        mangaInfo: {
          thumbnailUrl: 'https://example.com/cover.jpg',
          synopsis: 'A summary',
          primaryTitle: 'Test Manga',
          author: 'Some Author',
          status: 'Ongoing',
          tagGroups: [{ id: 'g', title: 'Genres', tags: [{ id: 'a', title: 'Action' }] }],
        },
      };
    }
    async getChapters(sourceManga) {
      return [
        { chapterId: 'c1', sourceManga, langCode: 'en', chapNum: 1, title: 'Chapter 1' },
      ];
    }
    async getChapterDetails(chapter) {
      return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: ['https://example.com/1.png', 'https://example.com/2.png'] };
    }
  }
  e.TestSource = new TestExtension();
  return e;
})({});
`;

describe('loadPaperbackPlugin', () => {
  it('loads a compiled bundle and wraps it as a MangaPlugin', async () => {
    const plugin = loadPaperbackPlugin('TestSource', TEST_BUNDLE);
    expect(plugin).toBeDefined();

    const manga = await plugin!.parseManga('m1');
    expect(manga.name).toBe('Test Manga');
    expect(manga.cover).toBe('https://example.com/cover.jpg');
    expect(manga.author).toBe('Some Author');
    expect(manga.status).toBe('Ongoing');
    expect(manga.genres).toBe('Action');
    expect(manga.chapters).toHaveLength(1);
    expect(manga.chapters[0].name).toBe('Chapter 1');

    const pages = await plugin!.parseChapter(manga.chapters[0].path);
    expect(pages.pages).toEqual([
      'https://example.com/1.png',
      'https://example.com/2.png',
    ]);
  });

  it('returns undefined for a bundle missing the plugin id', () => {
    const plugin = loadPaperbackPlugin('NotPresent', TEST_BUNDLE);
    expect(plugin).toBeUndefined();
  });

  it('returns undefined for invalid code instead of throwing', () => {
    const plugin = loadPaperbackPlugin(
      'TestSource',
      'this is not valid js {{{',
    );
    expect(plugin).toBeUndefined();
  });

  it('returns undefined for an older-generation (non-0.9) bundle', () => {
    // A minimal real v1-convention bundle (Browserify UMD, bare globals).
    // Doesn't match the 0.9 `var source = (...)({})` convention at all —
    // v1/0.8 bundle-format support has been removed entirely, so this must
    // fail to load rather than falling through to any legacy handling.
    const legacyBundle = `
      (function(f){
        if (typeof exports === "object" && typeof module !== "undefined") { module.exports = f(); }
      })(function(){
        class LegacySource {
          constructor(cheerio) { this.cheerio = cheerio; }
          async getMangaDetails(mangaId) {
            return { titles: ['Legacy Manga'], image: 'https://example.com/legacy.jpg', status: 1 };
          }
          async getChapters(mangaId) { return []; }
          async getChapterDetails(mangaId, chapterId) { return { id: chapterId, mangaId, pages: [], longStrip: false }; }
        }
        return { LegacySource: LegacySource };
      });
    `;

    const plugin = loadPaperbackPlugin('LegacySource', legacyBundle);
    expect(plugin).toBeUndefined();
  });

  it('popularManga uses a discover section rather than a blank-query search, matching a real source that treats blank search as "no results"', async () => {
    // Confirmed real bug/regression, found from a real downloaded bundle
    // (Inkdex's Webtoon): its actual getSearchResults is
    // `query.title ? this.getTitlesByKeyword(...) : Promise.resolve({items:[]})`
    // — a blank title deterministically returns ZERO items, before any
    // network call even happens. A prior version of popularManga preferred
    // getSearchResults with a blank query over a discover section (to work
    // around a *different* real issue — a source's first discover section
    // sometimes being a small curated shelf) — that broke Popular entirely
    // for any source following this same sensible "blank query = no
    // results" convention. Discover sections are the real, intended
    // "Popular" mechanism; blank-query search is only a last-resort
    // fallback for a source with no discover sections at all.
    const bundle = `
      var source = (function (e) {
        class BlankSearchExtension {
          async getMangaDetails(mangaId) {
            return { mangaId, mangaInfo: { thumbnailUrl: '', synopsis: '', primaryTitle: mangaId } };
          }
          async getChapters(sourceManga) { return []; }
          async getChapterDetails(chapter) { return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: [] }; }
          async getSearchResults(query) {
            return query.title ? { items: [{ mangaId: 'searched', title: 'Searched Result', imageUrl: '' }] } : { items: [] };
          }
          async getDiscoverSections() {
            return [{ id: 'trending', title: 'Trending' }];
          }
          async getDiscoverSectionItems(section) {
            return { items: [{ mangaId: 'trending-1', title: 'Trending Manga', imageUrl: 'https://example.com/t.jpg' }] };
          }
        }
        e.BlankSearchSource = new BlankSearchExtension();
        return e;
      })({});
    `;

    const plugin = loadPaperbackPlugin('BlankSearchSource', bundle);
    expect(plugin).toBeDefined();

    const popular = await plugin!.popularManga(1);
    expect(popular).toEqual([
      {
        id: undefined,
        name: 'Trending Manga',
        path: 'trending-1',
        cover: 'https://example.com/t.jpg',
      },
    ]);
  });

  it('exposes getSearchTags as MangaPlugin.filters and threads selected tags into getSearchResults', async () => {
    // Confirmed real mechanism (MangaDex): getSearchTags() returns
    // tag/genre sections; getSearchResults reads includedTags/excludedTags
    // from the query. NOT Application.registerSearchFilter, which no real
    // downloaded bundle was ever found to call.
    const bundle = `
      var source = (function (e) {
        class TaggedExtension {
          async getMangaDetails(mangaId) {
            return { mangaId, mangaInfo: { thumbnailUrl: '', synopsis: '', primaryTitle: mangaId } };
          }
          async getChapters(sourceManga) { return []; }
          async getChapterDetails(chapter) { return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: [] }; }
          async getSearchTags() {
            return [{ id: 'genres', title: 'Genres', tags: [{ id: 'action', title: 'Action' }, { id: 'romance', title: 'Romance' }] }];
          }
          async getSearchResults(query) {
            if (query.includedTags?.some(t => t.id === 'action')) {
              return { items: [{ mangaId: 'action-1', title: 'Action Manga', imageUrl: '' }] };
            }
            return { items: [] };
          }
        }
        e.TaggedSource = new TaggedExtension();
        return e;
      })({});
    `;

    const plugin = loadPaperbackPlugin('TaggedSource', bundle);
    expect(plugin).toBeDefined();

    // plugin.filters is populated asynchronously (mutated in place after
    // the `ready` chain resolves) — wait a microtask turn for it, same as
    // the browse screen does by re-reading plugin.filters after a fetch.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(plugin!.filters).toEqual({
      tags: {
        type: FilterTypes.ExcludableCheckboxGroup,
        label: 'Genres',
        options: [
          { label: 'Genres: Action', value: 'action' },
          { label: 'Genres: Romance', value: 'romance' },
        ],
        value: {},
      },
    });

    const results = await plugin!.popularManga(1, {
      filters: {
        tags: {
          type: FilterTypes.ExcludableCheckboxGroup,
          value: { include: ['action'] },
        },
      },
    });
    expect(results).toEqual([
      { id: undefined, name: 'Action Manga', path: 'action-1', cover: '' },
    ]);
  });
});

describe('fetchPaperbackRepositoryPlugins', () => {
  it('maps a versioning.json registry into PluginItem[] pointing at compiled bundles', async () => {
    const registryUrl =
      'https://example.github.io/repo/0.9/stable/versioning.json';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [
          {
            id: 'TestSource',
            name: 'Test Source',
            version: '1.0.0',
            icon: 'icon.png',
            language: 'en',
          },
        ],
      }),
    } as Response);

    const items = await fetchPaperbackRepositoryPlugins(registryUrl);

    expect(items).toEqual([
      {
        id: 'TestSource',
        name: 'Test Source',
        site: 'Test Source',
        lang: 'en',
        version: '1.0.0',
        url: 'https://example.github.io/repo/0.9/stable/TestSource/index.js',
        iconUrl:
          'https://example.github.io/repo/0.9/stable/TestSource/static/icon.png',
      },
    ]);
    fetchSpy.mockRestore();
  });

  it('throws a readable error when the registry request fails', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(
      fetchPaperbackRepositoryPlugins('https://example.com/versioning.json'),
    ).rejects.toThrow('404');
    fetchSpy.mockRestore();
  });
});
