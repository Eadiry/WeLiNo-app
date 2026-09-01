import * as cheerio from 'cheerio';

import { ChapterInfo } from '@database/types';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';
import { readChapterHtml } from './chapterHtml';

export interface TtsQueueParagraph {
  /** `"<chapterId>:<n>"` — unique across a multi-chapter queue. */
  id: string;
  text: string;
}

/** Same normalisation the WebView reader applies (`core.js` `normalizeText`). */
const normalizeText = (text: string): string => {
  if (!text) {
    return '';
  }
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s*([.,!?;:])\s*/g, '$1 ')
    .trim();
};

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';

/**
 * Splits a chapter's content HTML into readable paragraphs for the native TTS
 * queue, close enough to the reader's `getAllReadableElements` that counts
 * line up. The chapter title is paragraph 0 (matches the on-screen heading).
 * Returns `[]` when the chapter has no readable content (so the caller stops
 * buffering ahead).
 */
export const extractChapterParagraphs = async (
  pluginId: string,
  novelName: string,
  chapter: ChapterInfo,
): Promise<TtsQueueParagraph[]> => {
  let rawHtml: string;
  try {
    rawHtml = await readChapterHtml(pluginId, chapter);
  } catch {
    return [];
  }
  if (!rawHtml || !rawHtml.trim()) {
    return [];
  }

  const clean = sanitizeChapterText(pluginId, novelName, chapter.name, rawHtml);
  const $ = cheerio.load(clean);

  const texts: string[] = [];
  const push = (raw: string) => {
    const t = normalizeText(raw);
    if (t && texts[texts.length - 1] !== t) {
      texts.push(t);
    }
  };

  const blocks = $(BLOCK_SELECTOR).toArray();
  if (blocks.length > 0) {
    blocks.forEach(el => {
      // A block that wraps other blocks is covered by them — skip it.
      if ($(el).find(BLOCK_SELECTOR).length === 0) {
        push($(el).text());
      }
    });
  } else {
    $.root()
      .text()
      .split(/\n{2,}/)
      .forEach(push);
  }

  if (texts.length === 0) {
    return [];
  }

  const title = normalizeText(chapter.name);
  const withTitle = title ? [title, ...texts] : texts;
  return withTitle.map((text, i) => ({ id: `${chapter.id}:${i}`, text }));
};
