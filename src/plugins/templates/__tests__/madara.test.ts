import { createMadaraPlugin, madaraTemplate } from '../madara';
import { fetchApi, fetchText } from '../../helpers/fetch';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'WeLiNo test',
}));

jest.mock('../../helpers/fetch', () => ({
  fetchText: jest.fn(),
  fetchApi: jest.fn(),
}));

const mockFetchText = jest.mocked(fetchText);
const mockFetchApi = jest.mocked(fetchApi);

// Fixtures below mirror real, currently-live Madara markup (verified against
// toonily.com while researching this template) — trimmed to just the
// structural bits each selector reads.

const HOMEPAGE_HTML = `
<html><body>
  <nav>
    <a href="/">Home</a>
    <a href="https://example.com/webtoons/">Manhwa</a>
  </nav>
  <div class="page-item-detail">wp-manga</div>
</body></html>
`;

const NON_MADARA_HTML = `<html><body><h1>Just a regular blog</h1></body></html>`;

const LISTING_HTML = `
<html><body>
  <div class="page-item-detail manga">
    <div class="item-thumb c-image-hover">
      <a href="https://example.com/serie/some-manga/" title="Some Manga">
        <img data-src="https://example.com/covers/some-manga.jpg" src="placeholder.jpg" />
      </a>
    </div>
    <div class="item-summary">
      <div class="post-title font-title">
        <h3 class="h5"><a href="https://example.com/serie/some-manga/">Some Manga</a></h3>
      </div>
    </div>
  </div>
</body></html>
`;

const MANGA_PAGE_HTML = `
<html><body>
  <div class="post-title"><h1>Some Manga</h1></div>
  <div class="summary_image"><img data-src="https://example.com/covers/some-manga.jpg" /></div>
  <div class="summary_content"><div class="description-summary"><p>A great manga.</p></div></div>
  <div class="post-content_item">
    <div class="summary-heading">Author</div>
    <div class="summary-content">Jane Doe</div>
  </div>
  <div class="post-content_item">
    <div class="summary-heading">Status</div>
    <div class="summary-content">Ongoing</div>
  </div>
  <div class="genres-content"><a href="#">Action</a><a href="#">Fantasy</a></div>
  <div id="manga-chapters-holder" data-id="1234"></div>
  <script>var madara = {"ajaxurl":"https:\/\/example.com\/wp-admin\/admin-ajax.php","nonce":"46b118b2a7","manga_id":"1234"};</script>
</body></html>
`;

const MANGA_PAGE_HTML_INLINE_CHAPTERS = `
<html><body>
  <div class="post-title"><h1>Some Manga</h1></div>
  <ul class="main version-chap">
    <li class="wp-manga-chapter"><a href="https://example.com/serie/some-manga/chapter-2/">Chapter 2</a></li>
    <li class="wp-manga-chapter"><a href="https://example.com/serie/some-manga/chapter-1/">Chapter 1</a></li>
  </ul>
</body></html>
`;

const CHAPTER_AJAX_FRAGMENT = `
<ul>
  <li class="wp-manga-chapter">
    <a href="https://example.com/serie/some-manga/chapter-2/">Chapter 2</a>
    <span class="chapter-release-date">2 days ago</span>
  </li>
  <li class="wp-manga-chapter">
    <a href="https://example.com/serie/some-manga/chapter-1/">Chapter 1</a>
    <span class="chapter-release-date">1 week ago</span>
  </li>
</ul>
`;

const CHAPTER_PAGE_HTML = `
<html><body>
  <div class="reading-content">
    <img data-src="https://example.com/pages/1.jpg" src="placeholder.jpg" />
    <img data-lazy-src="https://example.com/pages/2.jpg" />
    <img src="https://example.com/pages/3.jpg" />
  </div>
</body></html>
`;

describe('madaraTemplate.detect', () => {
  it('recognizes Madara markup', () => {
    expect(madaraTemplate.detect(HOMEPAGE_HTML, 'https://example.com')).toBe(
      true,
    );
  });

  it('does not match a non-Madara page', () => {
    expect(madaraTemplate.detect(NON_MADARA_HTML, 'https://example.com')).toBe(
      false,
    );
  });
});

describe('createMadaraPlugin', () => {
  beforeEach(() => {
    mockFetchText.mockReset();
    mockFetchApi.mockReset();
  });

  it('resolves the listing path from the homepage nav and lists popular manga', async () => {
    mockFetchText.mockImplementation(async (url: string) => {
      if (url === 'https://example.com') return HOMEPAGE_HTML;
      if (url.includes('/webtoons/?m_orderby=views')) return LISTING_HTML;
      return '';
    });
    const plugin = createMadaraPlugin({
      id: 'example.com',
      name: 'example.com',
      baseUrl: 'https://example.com',
      lang: 'en',
    });

    const results = await plugin.popularManga(1);

    expect(results).toEqual([
      {
        id: undefined,
        name: 'Some Manga',
        path: 'https://example.com/serie/some-manga/',
        cover: 'https://example.com/covers/some-manga.jpg',
      },
    ]);
  });

  it('parses manga details and fetches chapters via the admin-ajax fallback', async () => {
    mockFetchText.mockResolvedValue(MANGA_PAGE_HTML);
    mockFetchApi.mockResolvedValue({
      ok: true,
      text: async () => CHAPTER_AJAX_FRAGMENT,
    } as Response);

    const plugin = createMadaraPlugin({
      id: 'example.com',
      name: 'example.com',
      baseUrl: 'https://example.com',
      lang: 'en',
      listingPath: '/webtoons/',
    });

    const manga = await plugin.parseManga(
      'https://example.com/serie/some-manga/',
    );

    expect(manga.name).toBe('Some Manga');
    expect(manga.summary).toBe('A great manga.');
    expect(manga.author).toBe('Jane Doe');
    expect(manga.genres).toBe('Action, Fantasy');
    expect(mockFetchApi).toHaveBeenCalledWith(
      'https://example.com/wp-admin/admin-ajax.php',
      expect.objectContaining({
        method: 'POST',
        body: 'action=manga_get_chapters&manga=1234&nonce=46b118b2a7',
      }),
    );
    expect(manga.chapters).toEqual([
      {
        name: 'Chapter 1',
        path: 'https://example.com/serie/some-manga/chapter-1/',
        releaseTime: '1 week ago',
      },
      {
        name: 'Chapter 2',
        path: 'https://example.com/serie/some-manga/chapter-2/',
        releaseTime: '2 days ago',
      },
    ]);
  });

  it('falls back to chapters already rendered on the manga page when there is no ajax holder', async () => {
    mockFetchText.mockResolvedValue(MANGA_PAGE_HTML_INLINE_CHAPTERS);

    const plugin = createMadaraPlugin({
      id: 'example.com',
      name: 'example.com',
      baseUrl: 'https://example.com',
      lang: 'en',
      listingPath: '/webtoons/',
    });

    const manga = await plugin.parseManga(
      'https://example.com/serie/some-manga/',
    );

    expect(manga.chapters.map(c => c.name)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(mockFetchApi).not.toHaveBeenCalled();
  });

  it('parses chapter pages, preferring lazy-load attributes over src', async () => {
    mockFetchText.mockResolvedValue(CHAPTER_PAGE_HTML);

    const plugin = createMadaraPlugin({
      id: 'example.com',
      name: 'example.com',
      baseUrl: 'https://example.com',
      lang: 'en',
      listingPath: '/webtoons/',
    });

    const pages = await plugin.parseChapter(
      'https://example.com/serie/some-manga/chapter-1/',
    );

    expect(pages.pages).toEqual([
      'https://example.com/pages/1.jpg',
      'https://example.com/pages/2.jpg',
      'https://example.com/pages/3.jpg',
    ]);
  });
});
