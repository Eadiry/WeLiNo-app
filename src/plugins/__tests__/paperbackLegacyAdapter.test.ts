import { loadPaperbackLegacySource } from '../paperbackLegacyAdapter';

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

// A trivial extension implemented against both real conventions confirmed
// live: v1 (Browserify UMD, bare globals — real NMN's/GameFuzzy's repos)
// and 0.8 (esbuild, `App.*` namespaced — real Netsky's repos). Both export
// the extension as a CLASS (not an instance), matching the real
// `paperback-extensions-common` `Source` base class's `constructor(cheerio)`.
// `%NS%` is substituted per-bundle ('' for v1's bare globals, 'App.' for
// 0.8's namespaced form) so each variant actually exercises its own
// host-global injection convention.
const SOURCE_BODY = `
  class TestExtension {
    constructor(cheerio) {
      this.cheerio = cheerio;
      this.requestManager = %NS%createRequestManager({});
    }
    async getMangaDetails(mangaId) {
      return {
        titles: ['Test Manga'],
        image: 'https://example.com/cover.jpg',
        status: 1,
        author: 'Jane Doe',
        tags: [{ id: 'g', label: 'Genres', tags: [{ id: 'a', label: 'Action' }] }],
      };
    }
    async getChapters(mangaId) {
      return [{ id: 'c1', mangaId, chapNum: 1, name: 'Chapter 1' }];
    }
    async getChapterDetails(mangaId, chapterId) {
      return { id: chapterId, mangaId, pages: ['https://example.com/1.png'], longStrip: false };
    }
    async getSearchResults(query) {
      return { results: [{ id: 'm1', title: { text: 'Test Manga' }, image: 'https://example.com/cover.jpg' }] };
    }
  }
`;

// Mirrors the real Browserify UMD footer verbatim (confirmed against a real
// downloaded bundle): takes the CommonJS branch when `module`/`exports` are
// present, so the class ends up directly on `module.exports`.
const V1_BUNDLE = `
(function(f){
  if (typeof exports === "object" && typeof module !== "undefined") { module.exports = f(); }
  else { var g; g = this; g.Sources = f(); }
})(function(){
  ${SOURCE_BODY.replace(/%NS%/g, '')}
  return { TestExtension: TestExtension };
});
`;

// Mirrors the real esbuild footer verbatim (confirmed against a real
// downloaded bundle): top-level "use strict", a bare top-level \`this\`, and
// an explicit \`.Sources\` nesting under module.exports. Uses \`App.*\` for
// every host call instead of bare globals.
const LEGACY_08_BUNDLE = `
"use strict";
var _Sources = (function(){
  ${SOURCE_BODY.replace(/%NS%/g, 'App.')}
  return { TestExtension: TestExtension };
})();
this.Sources = _Sources;
if (typeof exports === 'object' && typeof module !== 'undefined') { module.exports.Sources = this.Sources; }
`;

describe.each([
  ['v1 (Browserify, bare globals)', V1_BUNDLE],
  ['0.8 (esbuild, App.* namespaced)', LEGACY_08_BUNDLE],
])('loadPaperbackLegacySource — %s', (_label, bundle) => {
  it('loads the bundle and wraps it as a MangaPlugin', async () => {
    const plugin = loadPaperbackLegacySource('TestExtension', bundle);
    expect(plugin).toBeDefined();

    const manga = await plugin!.parseManga('m1');
    expect(manga.name).toBe('Test Manga');
    expect(manga.cover).toBe('https://example.com/cover.jpg');
    expect(manga.author).toBe('Jane Doe');
    expect(manga.genres).toBe('Action');
    expect(manga.chapters).toEqual([
      {
        name: 'Chapter 1',
        path: JSON.stringify({ mangaId: 'm1', chapterId: 'c1' }),
        chapterNumber: 1,
        releaseTime: undefined,
      },
    ]);

    const pages = await plugin!.parseChapter(manga.chapters[0].path);
    expect(pages.pages).toEqual(['https://example.com/1.png']);

    const popular = await plugin!.popularManga(1);
    expect(popular).toEqual([
      {
        id: undefined,
        name: 'Test Manga',
        path: 'm1',
        cover: 'https://example.com/cover.jpg',
      },
    ]);
  });

  it('returns undefined for a bundle missing the plugin id', () => {
    expect(loadPaperbackLegacySource('NotPresent', bundle)).toBeUndefined();
  });
});

it('returns undefined for invalid code instead of throwing', () => {
  expect(
    loadPaperbackLegacySource('TestExtension', 'this is not valid js {{{'),
  ).toBeUndefined();
});
