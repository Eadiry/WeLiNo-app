import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { Storage } from './storage';
import {
  looksCloudflareBlocked,
  resolveCloudflareCookies,
} from './cloudflareBypass';
import type { PBApplication, PBRequest, PBResponse } from '../types/paperback';

/**
 * Implements the `Application` global every compiled Paperback/Inkdex
 * extension bundle expects to already exist in scope (it's `declare global`
 * in the real `@paperback/types` package — never a module import, so a
 * bundle can't bring its own). One instance per loaded plugin, injected as an
 * extra ambient global alongside `require`/`module` — see
 * `createSandbox`'s `extraGlobals` option.
 *
 * The real Paperback app runs extensions in a *separate* JS context from the
 * host app (JavaScriptCore isolates on iOS), which is why its `Selector`
 * mechanism exists — functions can't cross that boundary directly, only
 * opaque ids can. Our sandbox runs everything in the *same* Hermes runtime,
 * so there's no boundary to cross: `Selector(obj, key)` here just returns a
 * plain `{ obj, key }` descriptor that `registerInterceptor` et al. can call
 * straight through.
 */
/**
 * Not part of the real `@paperback/types` SDK — an extra, our-own-use-only
 * member `paperbackAdapter.ts` calls once after an extension's `initialise()`
 * has registered its interceptors, to get the headers a real Paperback app
 * would apply to *image* requests too. Confirmed necessary from a real
 * downloaded bundle: its interceptor injects a static `referer` (and
 * `user-agent`) into every request's headers — that's exactly the kind of
 * hotlink-protection bypass a manga CDN commonly requires, but our actual
 * `<Image>` loading never goes through `scheduleRequest`/the interceptor
 * pipeline at all (native image components fetch directly via
 * `imageRequestInit`). Running the request-interceptor chain once against an
 * empty synthetic request recovers any *static* headers like this without
 * needing to re-run interceptors per image — correct for interceptors that
 * don't depend on the specific URL (the common case; this doesn't help ones
 * that compute per-URL signing).
 */
export interface PaperbackApplicationInternal {
  __resolveDefaultImageHeaders: () => Promise<Record<string, string>>;
}

export function createPaperbackApplication(
  pluginId: string,
): PBApplication & PaperbackApplicationInternal {
  const storage = new Storage(pluginId);
  const secureStorage = new Storage(`${pluginId}_secure`);

  type SelectorDescriptor = { obj: any; key: PropertyKey };
  const isSelector = (v: unknown): v is SelectorDescriptor =>
    !!v && typeof v === 'object' && 'obj' in (v as object);
  const callSelector = async (v: unknown, ...args: unknown[]) => {
    if (!isSelector(v)) return undefined;
    return v.obj[v.key](...args);
  };

  const requestInterceptors = new Map<
    string,
    { request: unknown; response: unknown }
  >();
  const discoverSections: unknown[] = [];
  const searchFilters: unknown[] = [];

  return {
    isResourceLimited: false,
    filterAdultTitles: false,
    filterMatureTitles: false,

    decodeHTMLEntities: (str: string) =>
      str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
          String.fromCodePoint(parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec))),

    sleep: (seconds: number) =>
      new Promise<void>(resolve => setTimeout(resolve, seconds * 1000)),

    getDefaultUserAgent: async () => getUserAgent(),

    scheduleRequest: async (
      request: PBRequest,
    ): Promise<[PBResponse, ArrayBuffer]> => {
      let req = request;
      for (const { request: reqSel } of requestInterceptors.values()) {
        const intercepted = (await callSelector(
          reqSel,
          req,
        )) as PBRequest | void;
        if (intercepted) req = intercepted;
      }

      const doFetch = async (
        requestToSend: PBRequest,
      ): Promise<{
        res: globalThis.Response;
        headers: Record<string, string>;
        buffer: ArrayBuffer;
      }> => {
        // Same fix as the legacy adapter's requestManager: without a
        // timeout, a server that never responds (a Cloudflare challenge
        // that never resolves, a dead host) leaves this pending forever —
        // a permanently stuck loading spinner with no error and no way out.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        let res: globalThis.Response;
        try {
          res = await fetch(requestToSend.url, {
            method: requestToSend.method,
            headers: requestToSend.headers,
            body:
              typeof requestToSend.body === 'string' ||
              requestToSend.body instanceof ArrayBuffer
                ? requestToSend.body
                : requestToSend.body
                ? JSON.stringify(requestToSend.body)
                : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        const buffer = await res.arrayBuffer();
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return { res, headers, buffer };
      };

      let { res, headers, buffer } = await doFetch(req);

      // Confirmed live this session: several real sources' backing sites
      // (and at least one source's own API, api.allanime.day) sit behind
      // Cloudflare and return a 403/503 "Just a moment..." challenge page
      // instead of real data. Most of the affected sources implement
      // neither of Paperback's official per-source bypass mechanisms
      // (`executeInWebView`, `getCloudflareBypassRequestAsync`), so a
      // transparent retry here — solve via a hidden WebView, attach the
      // resulting cookies, try once more — is the only thing that helps
      // them without needing any source cooperation.
      if (
        looksCloudflareBlocked(
          res.status,
          headers,
          new TextDecoder('utf-8').decode(buffer),
        )
      ) {
        const cookieHeader = await resolveCloudflareCookies(req.url);
        if (cookieHeader) {
          const retryReq: PBRequest = {
            ...req,
            headers: { ...(req.headers ?? {}), cookie: cookieHeader },
          };
          ({ res, headers, buffer } = await doFetch(retryReq));
        }
      }

      const response: PBResponse = {
        url: res.url || req.url,
        headers,
        status: res.status,
        mimeType: headers['content-type'],
        cookies: [],
      };

      for (const { response: resSel } of requestInterceptors.values()) {
        const intercepted = (await callSelector(
          resSel,
          req,
          response,
          buffer,
        )) as ArrayBuffer | void;
        if (intercepted) buffer = intercepted;
      }

      return [response, buffer];
    },

    arrayBufferToUTF8String: (buf: ArrayBuffer) =>
      new TextDecoder('utf-8').decode(buf),
    arrayBufferToASCIIString: (buf: ArrayBuffer) =>
      new TextDecoder('ascii').decode(buf),
    arrayBufferToUTF16String: (buf: ArrayBuffer) =>
      new TextDecoder('utf-16le').decode(buf),

    base64Encode: <T extends string | ArrayBuffer>(value: T): T => {
      if (typeof value === 'string') {
        return btoa(value) as T;
      }
      const bytes = new Uint8Array(value as ArrayBuffer);
      let binary = '';
      bytes.forEach(b => {
        binary += String.fromCharCode(b);
      });
      return btoa(binary) as T;
    },
    base64Decode: <T extends string | ArrayBuffer>(value: T): T => {
      const binary = atob(value as string);
      // Callers can't tell us which shape they want back, so mirror the
      // real SDK's convention: return a string, since that's what every
      // Inkdex source observed so far expects from base64Decode.
      return binary as T;
    },

    getState: (key: string) => storage.get(key),
    setState: (value: unknown, key: string) => storage.set(key, value),
    getSecureState: (key: string) => secureStorage.get(key),
    setSecureState: (value: unknown, key: string) =>
      secureStorage.set(key, value),
    resetAllState: () => storage.clearAll(),

    invalidateDiscoverSections: () => {
      discoverSections.length = 0;
    },
    invalidateSearchFilters: () => {
      searchFilters.length = 0;
    },

    registerInterceptor: (
      interceptorId: string,
      interceptRequestSelectorId: unknown,
      interceptResponseSelectorId: unknown,
    ) => {
      requestInterceptors.set(interceptorId, {
        request: interceptRequestSelectorId,
        response: interceptResponseSelectorId,
      });
    },
    unregisterInterceptor: (interceptorId: string) => {
      requestInterceptors.delete(interceptorId);
    },
    // Redirects: not yet supported — fetch() follows them itself, silently,
    // which is a reasonable default for sources that don't rely on
    // inspecting the redirect chain.
    setRedirectHandler: () => {},

    registerDiscoverSection: (section: unknown) => {
      discoverSections.push(section);
    },
    unregisterDiscoverSection: (sectionId: string) => {
      const i = discoverSections.findIndex((s: any) => s?.id === sectionId);
      if (i >= 0) discoverSections.splice(i, 1);
    },
    registeredDiscoverSections: () => [...discoverSections],

    registerSearchFilter: (filter: unknown) => {
      searchFilters.push(filter);
    },
    unregisterSearchFilter: (id: string) => {
      const i = searchFilters.findIndex((f: any) => f?.id === id);
      if (i >= 0) searchFilters.splice(i, 1);
    },
    registeredSearchFilters: () => [...searchFilters],

    Selector: <T extends object>(obj: T, key: keyof T) => ({ obj, key }),

    // Confirmed real, source-initiated API (not a Cloudflare-specific
    // hook the host calls into sources) — a real downloaded bundle
    // (Inkdex's AllManga) calls `Application.executeInWebView` directly
    // as part of its own chapter-fetch logic, awaiting a real
    // `{ result, storage: { cookies } }` back. Routed through the shared
    // headless WebView host (`CloudflareBypassHost`) — the same one the
    // transparent Cloudflare retry above uses — since both need a real
    // WebView executing real JS, not a Cloudflare-specific mechanism.
    executeInWebView: async (context: unknown) => {
      // Lazy `require()`, not a top-level import — same reasoning as
      // `helpers/cloudflareBypass.ts`'s `resolveCloudflareCookies`.
      const { requestWebViewExecution } =
        require('@components/CloudflareBypassHost') as typeof import('@components/CloudflareBypassHost');
      const ctx = context as {
        source: {
          html: string;
          baseUrl?: string;
          userAgent?: string;
        };
        inject: string;
        storage?: { cookies?: { name: string; value: string }[] };
      };
      const { result, cookies } = await requestWebViewExecution({
        html: ctx.source.html,
        baseUrl: ctx.source.baseUrl,
        cookies: ctx.storage?.cookies,
        inject: ctx.inject,
      });
      return { result, storage: { cookies } };
    },

    __resolveDefaultImageHeaders: async () => {
      let req: PBRequest = { url: '', method: 'GET', headers: {} };
      for (const { request: reqSel } of requestInterceptors.values()) {
        const intercepted = (await callSelector(
          reqSel,
          req,
        )) as PBRequest | void;
        if (intercepted) req = intercepted;
      }
      return req.headers ?? {};
    },
  };
}
