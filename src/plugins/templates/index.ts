import { fetchText } from '../helpers/fetch';
import { madaraTemplate } from './madara';
import type { SiteTemplate, TemplateConfig } from './types';

export type { SiteTemplate, TemplateConfig } from './types';
export { createMadaraPlugin } from './madara';

/** Every recognized CMS/theme template — Madara first, room to add more (MangaBox, NepNep, Liliana, …) without touching call sites. */
export const templates: SiteTemplate[] = [madaraTemplate];

const idFromUrl = (url: string): string =>
  new URL(url).hostname.replace(/^www\./, '');

/**
 * Fetches `url` once and checks it against every known template. Returns the
 * first match plus a best-effort config, or `undefined` if nothing
 * recognized the site — there's no universal fallback by design (see
 * `templates/types.ts`).
 */
export const detectSiteTemplate = async (
  url: string,
): Promise<{ template: SiteTemplate; config: TemplateConfig } | undefined> => {
  const baseUrl = new URL(url).origin;
  const html = await fetchText(url);
  if (!html) return undefined;

  const template = templates.find(t => t.detect(html, url));
  if (!template) return undefined;

  const id = idFromUrl(url);
  return {
    template,
    config: { id, name: id, baseUrl, lang: 'en' },
  };
};
