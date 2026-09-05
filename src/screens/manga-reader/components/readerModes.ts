import type { MangaRow } from '@database/schema';

export type ReaderMode = MangaRow['readerMode'];

/**
 * The six reading modes, matching the reference app's picker. `pagedVertical`
 * (discrete top-to-bottom page swipes) is distinct from `continuousVertical`
 * (smooth webtoon scroll).
 */
export const MODE_OPTIONS: {
  value: ReaderMode;
  label: string;
  icon: string;
}[] = [
  {
    value: 'pagedLtr',
    label: 'Paged (left to right)',
    icon: 'book-open-page-variant-outline',
  },
  {
    value: 'pagedRtl',
    label: 'Paged (right to left)',
    icon: 'book-open-page-variant-outline',
  },
  {
    value: 'pagedVertical',
    label: 'Paged (vertical)',
    icon: 'book-open-variant-outline',
  },
  {
    value: 'continuousLtr',
    label: 'Continuous (left to right)',
    icon: 'page-layout-header-footer',
  },
  {
    value: 'continuousRtl',
    label: 'Continuous (right to left)',
    icon: 'page-layout-header-footer',
  },
  {
    value: 'continuousVertical',
    label: 'Continuous (webtoon)',
    icon: 'page-layout-body',
  },
];

export const readerModeLabel = (mode: ReaderMode): string =>
  MODE_OPTIONS.find(o => o.value === mode)?.label ?? mode;
