import { createPaperbackApplication } from '../paperbackApplication';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'WeLiNo test',
}));
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
const mockRequestWebViewExecution = jest.fn();
jest.mock('@components/CloudflareBypassHost', () => ({
  requestCloudflareBypass: (url: string) => mockRequestCloudflareBypass(url),
  requestWebViewExecution: (params: unknown) =>
    mockRequestWebViewExecution(params),
}));

describe('createPaperbackApplication — scheduleRequest Cloudflare retry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockRequestCloudflareBypass.mockReset();
  });

  it('retries once with resolved cookies when the response looks Cloudflare-blocked', async () => {
    const app = createPaperbackApplication('test-plugin');
    const blockedBody = '<!DOCTYPE html><title>Just a moment...</title>';
    const okBody = '{"ok":true}';

    let calls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      calls++;
      const headers = (init as RequestInit)?.headers as
        | Record<string, string>
        | undefined;
      const body =
        headers?.cookie === 'cf_clearance=abc' ? okBody : blockedBody;
      return {
        status: headers?.cookie === 'cf_clearance=abc' ? 200 : 403,
        url: 'https://example.com',
        headers: {
          forEach: (cb: (v: string, k: string) => void) =>
            cb('cloudflare', 'server'),
        },
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      } as unknown as Response;
    });
    mockRequestCloudflareBypass.mockResolvedValueOnce([
      { name: 'cf_clearance', value: 'abc' },
    ]);

    const [response, buffer] = await app.scheduleRequest({
      url: 'https://example.com',
      method: 'GET',
      headers: {},
    });

    expect(calls).toBe(2);
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(buffer)).toBe(okBody);
    expect(mockRequestCloudflareBypass).toHaveBeenCalledWith(
      'https://example.com',
    );
  });

  it('does not retry a normal (non-Cloudflare) response', async () => {
    const app = createPaperbackApplication('test-plugin');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      url: 'https://example.com',
      headers: { forEach: () => {} },
      arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
    } as unknown as Response);

    await app.scheduleRequest({
      url: 'https://example.com',
      method: 'GET',
      headers: {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockRequestCloudflareBypass).not.toHaveBeenCalled();
  });
});

describe('createPaperbackApplication — executeInWebView', () => {
  afterEach(() => {
    mockRequestWebViewExecution.mockReset();
  });

  it('routes to the headless host with the exact shape a real bundle (AllManga) sends, and returns {result, storage}', async () => {
    const app = createPaperbackApplication('test-plugin');
    mockRequestWebViewExecution.mockResolvedValueOnce({
      result: 'ok',
      cookies: [{ name: 'cf_clearance', value: 'xyz' }],
    });

    const result = await app.executeInWebView({
      source: {
        html: '<html></html>',
        baseUrl: 'https://allanime.day',
        loadCSS: false,
        loadImages: false,
        userAgent: 'ua',
      },
      inject: 'return window.__allMangaResult__',
      storage: { cookies: [] },
    });

    expect(mockRequestWebViewExecution).toHaveBeenCalledWith({
      html: '<html></html>',
      baseUrl: 'https://allanime.day',
      cookies: [],
      inject: 'return window.__allMangaResult__',
    });
    expect(result).toEqual({
      result: 'ok',
      storage: { cookies: [{ name: 'cf_clearance', value: 'xyz' }] },
    });
  });
});
