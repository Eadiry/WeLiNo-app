import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { Storage } from './storage';
import type {
  LegacyCookie,
  LegacyRequest,
  LegacyRequestManager,
  LegacyResponse,
} from '../types/paperbackLegacy';

/**
 * Every `create*` global a v1/0.8 bundle expects ambient in scope is a
 * trivial identity function (`createManga = (m) => m`, confirmed by grepping
 * the real, MIT-licensed `paperback-extensions-common` npm package's
 * `_impl.js` files) — real compiled extensions call them purely for their
 * own type-narrowing convenience, so returning the argument unchanged is
 * byte-for-byte what the real implementation does.
 *
 * A hand-copied exhaustive name list turned out to be the wrong shape for
 * this: a real downloaded 0.8 bundle (Netsky's community `BatoTo`) calls
 * `App.createRequest`, `App.createDUISection`, `App.createMangaInfo`,
 * `App.createPartialSourceManga` — names that exist nowhere in the npm
 * package version inspected, meaning real bundles were compiled against
 * other SDK-generation namespaces the package's own history doesn't cover
 * cleanly. Since every one of these is *empirically always* an identity
 * function regardless of name or generation, `createPaperbackLegacyGlobals`
 * instead scans the bundle's own source for every `create<Name>` identifier
 * it actually references and synthesizes an identity function for any one
 * not already explicitly implemented below — self-healing against future
 * unknown SDK generations instead of guessing names ahead of time.
 *
 * The two with real behavior — `createRequestManager` (network) and
 * `createSourceStateManager` (persistence) — are reimplemented against this
 * app's own primitives (native `fetch`, the existing `Storage` class used
 * for `@libs/storage`) rather than the real impl's `axios`/`Buffer`, which
 * don't exist in this runtime.
 */

/** Real behavior from `RawData/_impl.js` — extensions occasionally call this directly on a response's raw bytes, not just through `createRequestManager`. */
const createRawData = (byteArray: Uint8Array) => {
  let text = '';
  let i = 0;
  while (i < byteArray.length) {
    const c = byteArray[i++];
    if (c >> 4 <= 7) {
      text += String.fromCharCode(c);
    } else if (c >> 4 === 12 || c >> 4 === 13) {
      const char2 = byteArray[i++];
      text += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
    } else if (c >> 4 === 14) {
      const char2 = byteArray[i++];
      const char3 = byteArray[i++];
      text += String.fromCharCode(
        ((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | (char3 & 0x3f),
      );
    }
  }
  return Object.assign(byteArray, { toString: () => text });
};

const buildRequestBody = (
  data: unknown,
  headers: Record<string, string>,
): BodyInit | undefined => {
  if (data == null) return undefined;
  if (typeof data === 'string') return data;
  if (headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    return Object.entries(data as Record<string, string>)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }
  return JSON.stringify(data);
};

const createRequestManager = (info: {
  requestsPerSecond?: number;
  requestTimeout?: number;
  interceptor?: {
    interceptRequest: (request: LegacyRequest) => Promise<LegacyRequest>;
    interceptResponse: (response: LegacyResponse) => Promise<LegacyResponse>;
  };
}): LegacyRequestManager => ({
  ...info,
  // Confirmed real usage: a real downloaded 0.8 bundle's own interceptor
  // calls `this.requestManager.getDefaultUserAgent()` — on the manager
  // instance itself, not a separate `Application` global like the 0.9
  // format's `Application.getDefaultUserAgent()`.
  getDefaultUserAgent: async () => getUserAgent(),
  schedule: async (requestIn: LegacyRequest): Promise<LegacyResponse> => {
    let request = requestIn;
    if (info.interceptor) {
      request = await info.interceptor.interceptRequest(request);
    }
    const headers: Record<string, string> = { ...(request.headers ?? {}) };
    const cookieData = (request.cookies ?? [])
      .map((c: LegacyCookie) => `${c.name}=${c.value};`)
      .join('');
    if (cookieData) headers.cookie = cookieData;
    headers['user-agent'] ??= getUserAgent();

    const res = await fetch(`${request.url}${request.param ?? ''}`, {
      method: request.method,
      headers,
      body: buildRequestBody(request.data, headers),
    });
    const buffer = await res.arrayBuffer();
    const rawData = new Uint8Array(buffer);
    const data = new TextDecoder('utf-8').decode(buffer);
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let response: LegacyResponse = {
      rawData: rawData.buffer as ArrayBuffer,
      data,
      status: res.status,
      headers: responseHeaders,
      request,
    };
    if (info.interceptor) {
      response = await info.interceptor.interceptResponse(response);
    }
    return response;
  },
});

const createSourceStateManager = (pluginId: string) => {
  const storage = new Storage(pluginId);
  const keychain = new Storage(`${pluginId}_keychain`);
  return (info?: Record<string, unknown>) => ({
    ...info,
    store: async (key: string, value: unknown) => {
      storage.set(key, value);
    },
    retrieve: async (key: string) => storage.get(key) ?? '',
    keychain: {
      store: async (key: string, value: unknown) => {
        keychain.set(key, value);
      },
      retrieve: async (key: string) => keychain.get(key) ?? '',
    },
  });
};

/**
 * Builds the full set of globals a v1/0.8 bundle expects, keyed by function
 * name — `paperbackLegacyAdapter.ts` injects every key both as a bare
 * `Function(...)` parameter (v1's convention) and as a property on an `App`
 * object (0.8's convention), so a bundle written against either resolves
 * the same calls correctly without needing to detect which one it is.
 *
 * `code` is scanned (not executed) for every `create<Name>` identifier the
 * bundle actually references, so an SDK-generation-specific name this
 * adapter has never seen still resolves to a harmless identity function
 * instead of throwing `... is not a function` — see the file doc comment.
 */
export function createPaperbackLegacyGlobals(
  pluginId: string,
  code: string,
): Record<string, unknown> {
  const globals: Record<string, unknown> = {
    createRequestManager,
    createSourceStateManager: createSourceStateManager(pluginId),
    createRawData,
    createByteArray: (rawData: ArrayLike<number>) => new Uint8Array(rawData),
  };
  const referenced = code.match(/\bcreate[A-Z]\w*/g) ?? [];
  for (const name of new Set(referenced)) {
    if (!(name in globals)) {
      globals[name] = (value: unknown) => value;
    }
  }
  return globals;
}
