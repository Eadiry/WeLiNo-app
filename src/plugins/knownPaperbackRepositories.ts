/**
 * A short list of known-good Paperback/Inkdex repositories, offered as
 * one-tap suggestions in `SettingsMangaRepositoryScreen`.
 *
 * Every entry here targets the 0.9 bundle format exclusively —
 * `paperbackAdapter.ts` is the only adapter left; the older v1/0.8
 * Browserify/esbuild-era support has been removed entirely. The previous
 * NMN's/GameFuzzy's/Netsky's entries all turned out to ship one of those
 * older formats despite promising-looking repo names or URL paths (real,
 * new source ids, but the wrong bundle generation, confirmed by downloading
 * and inspecting a real bundle from each) — replaced with these forks
 * (owned by this app's maintainer, under the `Eadiry` GitHub account),
 * each rebuilt from source and confirmed to publish a genuine 0.9-toolchain
 * `versioning.json` (checked the `builtWith.toolchain` field directly, not
 * just the URL path).
 *
 * Don't re-add anything here without the same download-and-inspect check —
 * a repo with the right source ids can still be an old bundle format this
 * app no longer supports.
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
    name: 'Inkdex Extensions (fork)',
    url: 'https://eadiry.github.io/INKDEXextensions/0.9/stable/versioning.json',
  },
  {
    name: 'pirate.vodka Extensions',
    url: 'https://eadiry.github.io/pirate.vodka-extensions/versioning.json',
  },
  {
    name: "Sinon's Extensions",
    url: 'https://eadiry.github.io/Sinon-Paperback-Extensions/0.9/stable/versioning.json',
  },
  {
    name: "Kitty's Extensions",
    url: 'https://eadiry.github.io/kitty-extensions-0.9/versioning.json',
  },
  {
    name: 'General Extensions (Mangago)',
    url: 'https://eadiry.github.io/general-extensions-mangago/0.9/stable/versioning.json',
  },
  {
    name: "Nyzzik's Extensions",
    url: 'https://eadiry.github.io/Nyzzikextensions/versioning.json',
  },
  {
    name: 'Kakarot Extension',
    url: 'https://eadiry.github.io/KakarotExtension/0.9/stable/versioning.json',
  },
];
