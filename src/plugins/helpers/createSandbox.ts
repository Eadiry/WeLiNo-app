import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { Storage, LocalStorage, SessionStorage } from './storage';

/**
 * Shape every plugin type (novel, manga, …) shares: a header bag used for
 * loading its cover/page images, defaulted with a User-Agent below.
 */
interface HasImageRequestInit {
  imageRequestInit?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

/**
 * Builds an `initPlugin`-shaped loader: runs a plugin's raw JS through
 * `require()`, restricted to `packages` (plus the always-available,
 * per-plugin-namespaced `@libs/storage`). Shared by every plugin manager
 * (novel, manga, …) so each gets the identical execution model — a plain
 * `Function(...)` eval, no separate JS engine/sandbox — without duplicating
 * it. `pluginId` scopes `@libs/storage`'s MMKV keys; it is otherwise opaque
 * to the sandbox.
 */
export function createSandbox<TPlugin>(packages: Record<string, unknown>) {
  return function initPlugin(
    pluginId: string,
    rawCode: string,
  ): TPlugin | undefined {
    try {
      const _require = (packageName: string) => {
        if (packageName === '@libs/storage') {
          return {
            storage: new Storage(pluginId),
            localStorage: new LocalStorage(pluginId),
            sessionStorage: new SessionStorage(pluginId),
          };
        }
        return packages[packageName];
      };
      /* eslint no-new-func: "off", curly: "error" */
      return Function(
        'require',
        'module',
        `const exports = module.exports = {};
        ${rawCode};
        return exports.default`,
      )(_require, {});
    } catch {
      return undefined;
    }
  };
}

/**
 * Every image-fetching plugin needs a User-Agent header or many sites reject
 * the request outright. Fills one in (without clobbering a plugin-supplied
 * one) — shared post-init step for novel and manga plugins alike.
 */
export function applyDefaultImageHeaders(plugin: HasImageRequestInit): void {
  if (!plugin.imageRequestInit) {
    plugin.imageRequestInit = { headers: { 'User-Agent': getUserAgent() } };
    return;
  }
  if (!plugin.imageRequestInit.headers) {
    plugin.imageRequestInit.headers = {};
  }
  const hasUserAgent = Object.keys(plugin.imageRequestInit.headers).some(
    header => header.toLowerCase() === 'user-agent',
  );
  if (!hasUserAgent) {
    plugin.imageRequestInit.headers['User-Agent'] = getUserAgent();
  }
}
