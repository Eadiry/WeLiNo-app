import type { MangaPlugin } from '../types/manga';

/**
 * A "site template" is a hand-written parser for one manga-site CMS/theme
 * (Madara, MangaThemesia, …), parameterized per domain — the same trick
 * every plugin ecosystem's "generic"/"multisrc" sources use. It is NOT a
 * universal scraper: `detect()` only recognizes sites built on that specific
 * software, and returns nothing for anything else.
 *
 * Unlike native (`pluginManager`-style sandboxed) or Paperback
 * (`paperbackAdapter`) plugins, a template plugin has no downloadable source
 * at all — `create()` builds the `MangaPlugin` directly from first-party
 * code plus a small per-site config. See `mangaPluginManager.ts`'s
 * `installTemplateMangaPlugin` for how that config is persisted/reloaded.
 */
export interface TemplateConfig {
  id: string;
  name: string;
  baseUrl: string;
  lang: string;
  /** Resolved at detect-time (which listing path this site actually uses) and persisted after, so it isn't re-guessed on every launch. */
  listingPath?: string;
}

export interface SiteTemplate {
  id: string;
  name: string;
  /** Cheap, synchronous fingerprint check against one already-fetched page's HTML. */
  detect: (html: string, url: string) => boolean;
  /** Builds the actual `MangaPlugin`. May do further network probing (e.g. to resolve `listingPath`) on first use. */
  create: (config: TemplateConfig) => MangaPlugin;
}
