import { load, type CheerioAPI } from 'cheerio';

import { fetchApi, fetchText } from '../helpers/fetch';
import {
  MangaStatus,
  type MangaChapterItem,
  type MangaChapterPages,
  type MangaPlugin,
  type MangaSourceItem,
  type SourceManga,
} from '../types/manga';
import type { SiteTemplate, TemplateConfig } from './types';

/**
 * Madara (by Mangabooth) is the single most common WordPress "manga site"
 * theme/plugin — verified live against a real, currently-running Madara site
 * (toonily.com) while researching this: `.item-summary .post-title h3 a`,
 * `.manga-title-badges`, `wp-manga` classes are exactly what a real page
 * still serves. This template is a parameterized parser for that one CMS,
 * not a universal scraper — `detect()` only matches Madara markup.
 *
 * Known, disclosed limitation: the manga-listing path (`/manga/`,
 * `/webtoons/`, `/comic/`, …) isn't standardized — every Madara site's admin
 * picks their own. Resolved by scanning the homepage's nav links for a
 * plausible listing slug the first time a plugin is used, then cached for
 * the rest of the session (not persisted back into `TemplateConfig` in v1 —
 * worst case, one extra request after each cold start).
 */

const LISTING_SLUG_RE = /\/(manga|webtoons?|comics?|series|read)\/?$/i;
const FALLBACK_LISTING_PATH = '/manga/';

const absoluteUrl = (base: string, href?: string): string | undefined => {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
};

/** Item card shared by the popular/latest listing and the search results page. */
const parseItemCards = ($: CheerioAPI, baseUrl: string): MangaSourceItem[] => {
  const cards = $('.page-item-detail, .c-tabs-item__content').toArray();
  return cards
    .map((card): MangaSourceItem | undefined => {
      const el = $(card);
      const link = el
        .find('.item-summary .post-title a, .post-title a')
        .first();
      const path = absoluteUrl(baseUrl, link.attr('href'));
      const name = link.text().trim();
      const img = el.find('.item-thumb img, img').first();
      const cover = absoluteUrl(
        baseUrl,
        img.attr('data-src')?.trim() ||
          img.attr('data-lazy-src')?.trim() ||
          img.attr('src')?.trim(),
      );
      if (!path || !name) return undefined;
      return { id: undefined, name, path, cover };
    })
    .filter((item): item is MangaSourceItem => !!item);
};

const resolveListingPath = (html: string, baseUrl: string): string => {
  const $ = load(html);
  let found: string | undefined;
  $('a[href]').each((_, el) => {
    if (found) return;
    const href = $(el).attr('href') ?? '';
    try {
      const url = new URL(href, baseUrl);
      if (url.origin !== new URL(baseUrl).origin) return;
      if (LISTING_SLUG_RE.test(url.pathname)) {
        found = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      }
    } catch {
      // not a valid URL — ignore
    }
  });
  return found ?? FALLBACK_LISTING_PATH;
};

/** Finds a `.post-content_item`-style info block by its heading text (e.g. "Status", "Author"). */
const infoByLabel = ($: CheerioAPI, label: string): string | undefined => {
  let value: string | undefined;
  $('.post-content_item, .summary-heading').each((_, el) => {
    if (value) return;
    const block = $(el).is('.summary-heading') ? $(el).parent() : $(el);
    const heading = block.find('.summary-heading').text().trim().toLowerCase();
    if (heading === label.toLowerCase()) {
      value = block.find('.summary-content').text().trim();
    }
  });
  return value;
};

const mapStatus = (raw?: string): MangaStatus => {
  switch (raw?.toLowerCase()) {
    case 'ongoing':
      return MangaStatus.Ongoing;
    case 'completed':
      return MangaStatus.Completed;
    case 'canceled':
    case 'cancelled':
      return MangaStatus.Cancelled;
    case 'on hold':
    case 'on-hold':
    case 'hiatus':
      return MangaStatus.OnHiatus;
    default:
      return MangaStatus.Unknown;
  }
};

const parseChapterListFragment = (
  $: CheerioAPI,
  baseUrl: string,
): MangaChapterItem[] => {
  return $('li.wp-manga-chapter')
    .toArray()
    .map((li): MangaChapterItem | undefined => {
      const el = $(li);
      const link = el.find('a').first();
      const path = absoluteUrl(baseUrl, link.attr('href'));
      const name = link.text().trim();
      const releaseTime =
        el.find('.chapter-release-date').text().trim() || undefined;
      if (!path || !name) return undefined;
      return { name, path, releaseTime };
    })
    .filter((item): item is MangaChapterItem => !!item)
    .reverse(); // Madara lists newest-first; our contract wants reading order
};

export const createMadaraPlugin = (config: TemplateConfig): MangaPlugin => {
  const { id, name, baseUrl, lang } = config;
  let listingPath = config.listingPath;

  const ensureListingPath = async (): Promise<string> => {
    if (listingPath) return listingPath;
    const html = await fetchText(baseUrl);
    listingPath = resolveListingPath(html, baseUrl);
    return listingPath;
  };

  const fetchListing = async (
    orderBy: 'views' | 'latest',
    pageNo: number,
  ): Promise<MangaSourceItem[]> => {
    const path = await ensureListingPath();
    const url =
      pageNo > 1
        ? `${baseUrl}${path}page/${pageNo}/?m_orderby=${orderBy}`
        : `${baseUrl}${path}?m_orderby=${orderBy}`;
    const html = await fetchText(url);
    return parseItemCards(load(html), baseUrl);
  };

  return {
    id,
    name,
    site: baseUrl,
    lang,
    version: '1.0.0',
    url: baseUrl,
    iconUrl: '',
    // Manga image CDNs commonly hotlink-block requests missing a Referer
    // matching the site — a very common real-world requirement (the page
    // HTML itself rarely checks this, only the image CDN, which is why data
    // can load fine while every cover/page image comes back broken).
    imageRequestInit: { headers: { Referer: baseUrl } },

    async popularManga(pageNo) {
      return fetchListing('views', pageNo);
    },

    async searchManga(searchTerm, pageNo) {
      const url = `${baseUrl}/page/${pageNo}/?s=${encodeURIComponent(
        searchTerm,
      )}&post_type=wp-manga`;
      const html = await fetchText(url);
      return parseItemCards(load(html), baseUrl);
    },

    async parseManga(mangaPath): Promise<SourceManga> {
      const html = await fetchText(mangaPath);
      const $ = load(html);

      const mangaName = $('.post-title h1').text().trim();
      const summary =
        $('.summary_content .description-summary p, .summary__content p')
          .text()
          .trim() || undefined;
      const author = infoByLabel($, 'Author') || undefined;
      const artist = infoByLabel($, 'Artist') || undefined;
      const genres =
        $('.genres-content a')
          .toArray()
          .map(a => $(a).text().trim())
          .filter(Boolean)
          .join(', ') || undefined;
      const status = mapStatus(infoByLabel($, 'Status'));
      const cover = absoluteUrl(
        baseUrl,
        $('.summary_image img').attr('data-src')?.trim() ||
          $('.summary_image img').attr('src')?.trim(),
      );

      let chapters = parseChapterListFragment($, mangaPath);
      if (chapters.length === 0) {
        const mangaId = $('#manga-chapters-holder').attr('data-id');
        if (mangaId) {
          // Some Madara installs require the ajax nonce their inline script
          // embeds (`var madara = {..., "nonce": "…"}`) — cheap to include
          // when present, harmless to omit when it isn't required.
          const nonce = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/)?.[1];
          const body = nonce
            ? `action=manga_get_chapters&manga=${mangaId}&nonce=${nonce}`
            : `action=manga_get_chapters&manga=${mangaId}`;
          const res = await fetchApi(`${baseUrl}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          });
          if (res.ok) {
            chapters = parseChapterListFragment(
              load(await res.text()),
              mangaPath,
            );
          }
        }
      }

      return {
        id: undefined,
        name: mangaName,
        path: mangaPath,
        cover,
        summary,
        author,
        artist,
        genres,
        status,
        chapters,
      };
    },

    async parseChapter(chapterPath): Promise<MangaChapterPages> {
      const html = await fetchText(chapterPath);
      const $ = load(html);
      const pages = $('div.reading-content img')
        .toArray()
        .map(img => {
          const el = $(img);
          return absoluteUrl(
            baseUrl,
            el.attr('data-src')?.trim() ||
              el.attr('data-lazy-src')?.trim() ||
              el.attr('src')?.trim(),
          );
        })
        .filter((src): src is string => !!src);
      return { pages };
    },
  };
};

const MADARA_FINGERPRINT_RE =
  /wp-manga-chapter|manga-title-badges|page-item-detail|madara[_-]core|wp-manga/i;

export const madaraTemplate: SiteTemplate = {
  id: 'madara',
  name: 'Madara',
  detect: (html: string) => MADARA_FINGERPRINT_RE.test(html),
  create: createMadaraPlugin,
};
