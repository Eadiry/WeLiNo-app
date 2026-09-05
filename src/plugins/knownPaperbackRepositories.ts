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
 * Paperback's extension ecosystem turns out to have (at least) three
 * incompatible bundle-format generations across its history, and repo
 * *names* don't reliably say which one they use — e.g. "Netsky's Extensions
 * (0.9)" and NMN's/GameFuzzy's repos all looked promising (real, new source
 * ids) but ship an older Browserify/esbuild bundle, confirmed by downloading
 * and inspecting a real bundle from each (not just their versioning.json).
 * `paperbackAdapter.ts`/`paperbackLegacyAdapter.ts` now cover all three
 * generations (0.9, v1, and 0.8) — this list only needed trimming while just
 * the 0.9 format was supported; don't remove an entry here again just
 * because a repo turns out to be an older format without checking whether
 * the legacy adapter already covers it. Don't re-add anything NEW here
 * without the same download-and-inspect check either — a repo with the
 * right source ids can still be a bundle format nothing here supports yet.
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
  {
    name: "NMN's Extensions",
    url: 'https://pandeynmn.github.io/nmns-extensions/main/versioning.json',
  },
  {
    name: "GameFuzzy's Extensions",
    url: 'https://gamefuzzy.github.io/extensions-gamefuzzy/main/versioning.json',
  },
  {
    name: "Netsky's Extensions",
    url: 'https://thenetsky.github.io/netskys-extensions/0.9/versioning.json',
  },
  {
    name: "Netsky's Community Extensions",
    url: 'https://thenetsky.github.io/community-extensions/0.8/versioning.json',
  },
];
