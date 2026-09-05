/**
 * A short list of known-good Paperback/Inkdex repositories, offered as
 * one-tap suggestions in `SettingsMangaRepositoryScreen`.
 *
 * Deliberately NOT padded: the Inkdex org publishes several per-CMS
 * "sub-repos" (madara-extensions, mangabox-extensions, etc.) that look like
 * separate catalogs but are actually 100% duplicated inside the main
 * `inkdex/extensions` registry below (verified by diffing source ids across
 * all of them — zero net-new sources in any of them) — so they're
 * deliberately left out here rather than padding this list with
 * already-included duplicates.
 *
 * Only ONE repository is listed below, not because others don't exist, but
 * because this is the only one confirmed to use the bundle format
 * `paperbackAdapter.ts` actually supports (`var source =
 * (function(e){...})({})`). Paperback's extension ecosystem turns out to
 * have at least three incompatible bundle-format generations across its
 * history, and repo *names* don't reliably say which one they use — e.g.
 * "Netsky's Extensions (0.9)" and NMN's/GameFuzzy's repos all looked
 * promising (real, new source ids) but every one of them ships an older
 * Browserify/CommonJS-interop bundle our adapter can't parse, confirmed by
 * downloading and inspecting a real bundle from each (not just their
 * versioning.json). Don't re-add a repo here without doing that same
 * download-and-inspect check — a repo with the right source ids can still
 * be the wrong bundle format.
 */
export interface KnownPaperbackRepository {
  name: string;
  url: string;
}

export const KNOWN_PAPERBACK_REPOSITORIES: KnownPaperbackRepository[] = [
  {
    name: 'Inkdex Extensions',
    url: 'https://inkdex.github.io/extensions/0.9/stable/versioning.json',
  },
];
