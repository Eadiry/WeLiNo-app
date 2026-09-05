import { aniListTracker, aniListMangaTracker } from '../aniList';

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'lnreader://tracker/AL'),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const auth = { accessToken: 'token', expiresAt: new Date() };

describe('AniList tracker media-type parameterization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AniList's own `type` enum is ANIME/MANGA -- light novels are
  // catalogued *under* MANGA with `format: NOVEL` (there's no separate
  // light-novel type). Confirmed real distinction: the query sent to
  // AniList's GraphQL API differs only in that `format` argument.
  it('the default (novel) tracker searches format: NOVEL', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ data: { Page: { media: [] } } }),
    } as unknown as Response);

    await aniListTracker.handleSearch('test', auth);

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.query).toContain('format: NOVEL');
  });

  it('the manga tracker searches format: MANGA', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ data: { Page: { media: [] } } }),
    } as unknown as Response);

    await aniListMangaTracker.handleSearch('test', auth);

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.query).toContain('format: MANGA');
  });
});
