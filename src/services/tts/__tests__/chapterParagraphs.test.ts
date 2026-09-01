import { ChapterInfo } from '@database/types';
import { extractChapterParagraphs } from '../chapterParagraphs';

jest.mock('../chapterHtml', () => ({
  readChapterHtml: jest.fn(),
}));
jest.mock('@screens/reader/utils/sanitizeChapterText', () => ({
  sanitizeChapterText: (
    _pluginId: string,
    _novelName: string,
    _chapterName: string,
    html: string,
  ) => html,
}));

const { readChapterHtml } = require('../chapterHtml') as {
  readChapterHtml: jest.Mock;
};

const chapter = {
  id: 42,
  novelId: 1,
  name: 'Chapter 7: The Duel',
  path: '/c/7',
} as ChapterInfo;

describe('extractChapterParagraphs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('splits block elements, normalises text and prepends the chapter title', async () => {
    readChapterHtml.mockResolvedValue(
      '<div><p>  First   line. </p><p>Second line</p><blockquote>A quote</blockquote></div>',
    );

    const paragraphs = await extractChapterParagraphs('p', 'Novel', chapter);

    expect(paragraphs).toEqual([
      { id: '42:0', text: 'Chapter 7: The Duel' },
      { id: '42:1', text: 'First line.' },
      { id: '42:2', text: 'Second line' },
      { id: '42:3', text: 'A quote' },
    ]);
  });

  it('skips a block that only wraps other blocks', async () => {
    readChapterHtml.mockResolvedValue(
      '<div class="outer"><p>Only real paragraph</p></div>',
    );

    const paragraphs = await extractChapterParagraphs('p', 'Novel', chapter);

    expect(paragraphs.map(p => p.text)).toEqual([
      'Chapter 7: The Duel',
      'Only real paragraph',
    ]);
  });

  it('returns [] when the chapter has no readable content', async () => {
    readChapterHtml.mockResolvedValue('   ');
    expect(await extractChapterParagraphs('p', 'Novel', chapter)).toEqual([]);
  });

  it('returns [] when the HTML load throws', async () => {
    readChapterHtml.mockRejectedValue(new Error('offline'));
    expect(await extractChapterParagraphs('p', 'Novel', chapter)).toEqual([]);
  });
});
