import {
  looksCloudflareBlocked,
  resolveCloudflareCookies,
} from '../cloudflareBypass';

// A real in-memory-backed fake, not bare jest.fn() stubs — the caching
// test below needs set() -> get() to actually round-trip within a test.
jest.mock('react-native-mmkv', () => {
  const data = new Map<string, string>();
  return {
    createMMKV: () => ({
      set: (key: string, value: string) => data.set(key, value),
      getString: (key: string) => data.get(key),
      remove: (key: string) => data.delete(key),
      getAllKeys: () => [...data.keys()],
    }),
  };
});

const mockRequestCloudflareBypass = jest.fn();
jest.mock('@components/CloudflareBypassHost', () => ({
  requestCloudflareBypass: (url: string) => mockRequestCloudflareBypass(url),
}));

describe('looksCloudflareBlocked', () => {
  it('matches the real shape confirmed live against api.allanime.day (403 + Server: cloudflare)', () => {
    expect(
      looksCloudflareBlocked(
        403,
        { server: 'cloudflare' },
        '<!DOCTYPE html><html><head><title>Just a moment...</title>',
      ),
    ).toBe(true);
  });

  it('matches on body markers alone when the Server header is absent', () => {
    expect(
      looksCloudflareBlocked(
        503,
        {},
        'checking your browser... cf-browser-verification',
      ),
    ).toBe(true);
  });

  it('does not false-positive on an ordinary 403 from a non-Cloudflare site', () => {
    expect(
      looksCloudflareBlocked(
        403,
        { server: 'nginx' },
        '<h1>403 Forbidden</h1>',
      ),
    ).toBe(false);
  });

  it('does not false-positive on a 200 response even if the body happens to mention Cloudflare', () => {
    expect(
      looksCloudflareBlocked(
        200,
        { server: 'cloudflare' },
        'this site uses Cloudflare for DNS',
      ),
    ).toBe(false);
  });

  it('does not match a non-403/503 status', () => {
    expect(
      looksCloudflareBlocked(404, { server: 'cloudflare' }, 'Just a moment'),
    ).toBe(false);
  });
});

describe('resolveCloudflareCookies', () => {
  beforeEach(() => {
    mockRequestCloudflareBypass.mockReset();
  });

  it('returns a Cookie header built from the resolved cookies and caches it per domain', async () => {
    mockRequestCloudflareBypass.mockResolvedValueOnce([
      { name: 'cf_clearance', value: 'abc123' },
    ]);

    const header = await resolveCloudflareCookies(
      'https://example.com/manga/1',
    );
    expect(header).toBe('cf_clearance=abc123');
    expect(mockRequestCloudflareBypass).toHaveBeenCalledWith(
      'https://example.com/manga/1',
    );

    // Second call for the same domain should hit the cache, not the WebView again.
    const second = await resolveCloudflareCookies(
      'https://example.com/manga/2',
    );
    expect(second).toBe('cf_clearance=abc123');
    expect(mockRequestCloudflareBypass).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the bypass fails rather than throwing', async () => {
    mockRequestCloudflareBypass.mockRejectedValueOnce(new Error('timed out'));
    const header = await resolveCloudflareCookies(
      'https://blocked.example.com',
    );
    expect(header).toBeUndefined();
  });
});
