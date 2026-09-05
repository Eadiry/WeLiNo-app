import { createPaperbackLegacyGlobals } from '../paperbackLegacyGlobals';
import type { LegacyRequestManager } from '../../types/paperbackLegacy';

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

const requestManagerFactory = (pluginId = 'test') => {
  const globals = createPaperbackLegacyGlobals(pluginId, '');
  return globals.createRequestManager as (info: {
    requestTimeout?: number;
    interceptor?: unknown;
  }) => LegacyRequestManager;
};

describe('paperbackLegacyGlobals — createRequestManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries a network failure up to the caller-supplied retryCount, matching a real bundle calling schedule(request, 1)', async () => {
    // Confirmed real bug: the real SDK's `schedule(request, retryCount)`
    // signature takes a caller-supplied retry count (a real downloaded
    // bundle calls `this.requestManager.schedule(request, 1)`), but the
    // implementation never read it — a single transient network failure
    // surfaced immediately instead of being retried once as the extension
    // author explicitly asked for.
    const createRequestManager = requestManagerFactory();
    const manager = createRequestManager({});

    let calls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls < 3) {
        throw new TypeError('Network request failed');
      }
      return {
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('ok').buffer,
        headers: { forEach: () => {} },
      } as unknown as Response;
    });

    const response = await manager.schedule(
      { url: 'https://example.com', method: 'GET' },
      2,
    );

    expect(calls).toBe(3);
    expect(response.data).toBe('ok');
  });

  it('does not retry beyond retryCount and surfaces the final failure', async () => {
    const createRequestManager = requestManagerFactory();
    const manager = createRequestManager({});

    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      manager.schedule({ url: 'https://example.com', method: 'GET' }, 1),
    ).rejects.toThrow('Network request failed');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry at all when retryCount is omitted (matches the real SDK default of none)', async () => {
    const createRequestManager = requestManagerFactory();
    const manager = createRequestManager({});

    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      manager.schedule({ url: 'https://example.com', method: 'GET' }),
    ).rejects.toThrow('Network request failed');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts and rejects once requestTimeout elapses instead of hanging forever', async () => {
    jest.useFakeTimers();
    const createRequestManager = requestManagerFactory();
    const manager = createRequestManager({ requestTimeout: 1000 });

    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal;
          signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const pending = manager.schedule({
      url: 'https://example.com',
      method: 'GET',
    });
    jest.advanceTimersByTime(1000);
    await expect(pending).rejects.toThrow();
    jest.useRealTimers();
  });
});
