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
 * The entries below ARE genuinely additive — each verified live to contain
 * at least one source id not present in the main registry.
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
