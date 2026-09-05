import {
  fetchPaperbackRepositoryPlugins,
  loadPaperbackPlugin,
} from '../paperbackAdapter';

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

  it('falls through to the legacy adapter for an older-generation bundle', async () => {
    // A minimal real v1-convention bundle (Browserify UMD, bare globals —
    // see paperbackLegacyAdapter.test.ts for the fuller fixture/rationale).
    // Doesn't match the 0.9 `var source = (...)({})` convention at all, so
    // this only passes if loadPaperbackPlugin actually falls through rather
    // than just returning undefined from the first attempt.
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
    expect(plugin).toBeDefined();
    const manga = await plugin!.parseManga('m1');
    expect(manga.name).toBe('Legacy Manga');
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
