import { render, screen, fireEvent } from '@testing-library/react-native';

import MangaChapterRow from '../MangaChapterRow';
import type { DisplayMangaChapter } from '@navigators/types';
import type { ThemeColors } from '@theme/types';

const theme = {
  onSurface: '#111111',
  onSurfaceVariant: '#555555',
  onSurfaceDisabled: '#999999',
  primary: '#6750a4',
  rippleColor: 'rgba(0,0,0,0.1)',
} as ThemeColors;

const baseChapter = {
  id: 1,
  mangaId: 1,
  path: '/c1',
  name: 'Chapter 1',
  releaseTime: '2026-08-01T00:00:00.000Z',
  bookmark: false,
  unread: true,
  readTime: null,
  isDownloaded: false,
  updatedTime: null,
  chapterNumber: 1,
  page: '1',
  position: 0,
  progress: null,
  lastPageRead: 0,
  scanlator: 'ScanGroup',
  timeSpent: 0,
} as unknown as DisplayMangaChapter;

describe('MangaChapterRow', () => {
  it('shows an unread chapter with the full-strength text color', () => {
    render(
      <MangaChapterRow
        chapter={baseChapter}
        theme={theme}
        onPress={jest.fn()}
      />,
    );
    const name = screen.getByText('Chapter 1');
    expect(name.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: theme.onSurface }),
      ]),
    );
  });

  it('dims a read chapter', () => {
    render(
      <MangaChapterRow
        chapter={{ ...baseChapter, unread: false } as DisplayMangaChapter}
        theme={theme}
        onPress={jest.fn()}
      />,
    );
    const name = screen.getByText('Chapter 1');
    expect(name.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: theme.onSurfaceDisabled }),
      ]),
    );
  });

  it('assembles the subtitle from release date, scanlator, and paged progress', () => {
    render(
      <MangaChapterRow
        chapter={{ ...baseChapter, lastPageRead: 4 } as DisplayMangaChapter}
        theme={theme}
        onPress={jest.fn()}
      />,
    );
    // release date is locale-formatted, so match the stable parts around it
    expect(screen.getByText(/ScanGroup • Page 5$/)).toBeTruthy();
  });

  it('renders a non-locale absolute date once the release is older than a week', () => {
    render(
      <MangaChapterRow
        chapter={
          {
            ...baseChapter,
            releaseTime: '2021-08-08T12:00:00.000Z',
            scanlator: null,
            lastPageRead: 0,
          } as DisplayMangaChapter
        }
        theme={theme}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Aug 08, 2021')).toBeTruthy();
  });

  it('shows an inert placeholder download control', () => {
    render(
      <MangaChapterRow
        chapter={baseChapter}
        theme={theme}
        onPress={jest.fn()}
      />,
    );
    const placeholder = screen.getByTestId('chapter-download-placeholder');
    expect(placeholder).toBeTruthy();
    // no press handler — downloads aren't built yet (Phase 4)
    expect(placeholder.props.onStartShouldSetResponder).toBeUndefined();
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(
      <MangaChapterRow chapter={baseChapter} theme={theme} onPress={onPress} />,
    );
    fireEvent.press(screen.getByText('Chapter 1'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
