import { useCallback, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';

import MangaPageImage from '@components/MangaPageImage';
import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';

interface ContinuousMangaReaderProps {
  pages: string[];
  requestInit?: ImageRequestInit;
  theme: ThemeColors;
  initialPage?: number;
  /** Reading direction — right-to-left reverses scroll/page order, same convention as `PagedMangaReader`'s `rtl` prop. */
  rtl?: boolean;
  /** Furthest page seen (in original, non-reversed page order), as a 0-100 percentage and the raw page index — same shape as `VerticalMangaReader`'s `onProgress`. */
  onProgress: (percent: number, pageIndex: number) => void;
  onTap?: () => void;
}

/**
 * `VerticalMangaReader`'s horizontal sibling — a smooth continuous
 * *sideways* scroll through pages placed edge to edge, as opposed to
 * `PagedMangaReader`'s discrete swipe-to-turn pages. Reuses
 * `MangaPageImage` exactly as-is: it's already width-driven (fixed width,
 * computed height from aspect ratio), which is exactly right for a
 * horizontal strip where each page occupies one screen-width slot.
 *
 * RTL reverses the rendered array rather than flipping a native
 * layout-direction flag (unlike `PagedMangaReader`, `LegendList` has no
 * such flag) — display index `i` maps back to original page index
 * `pages.length - 1 - i` when reporting progress, so `onProgress`/the
 * caller never needs to know about the reversal.
 */
const ContinuousMangaReader = ({
  pages,
  requestInit,
  theme,
  initialPage = 0,
  rtl = false,
  onProgress,
  onTap,
}: ContinuousMangaReaderProps) => {
  const { width } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  const furthestRef = useRef(initialPage);

  const displayPages = useMemo(
    () => (rtl ? [...pages].reverse() : pages),
    [pages, rtl],
  );
  const toOriginalIndex = useCallback(
    (displayIndex: number) =>
      rtl ? pages.length - 1 - displayIndex : displayIndex,
    [rtl, pages.length],
  );
  const toDisplayIndex = useCallback(
    (originalIndex: number) =>
      rtl ? pages.length - 1 - originalIndex : originalIndex,
    [rtl, pages.length],
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const maxOriginalIndex = viewableItems.reduce((max, item) => {
        if (item.index == null) return max;
        return Math.max(max, toOriginalIndex(item.index));
      }, furthestRef.current);
      if (maxOriginalIndex > furthestRef.current) {
        furthestRef.current = maxOriginalIndex;
        const percent = pages.length
          ? Math.round(((maxOriginalIndex + 1) / pages.length) * 100)
          : 0;
        onProgress(percent, maxOriginalIndex);
      }
    },
    [pages.length, onProgress, toOriginalIndex],
  );

  return (
    <LegendList
      ref={listRef}
      data={displayPages}
      keyExtractor={(item, index) => `${index}-${item}`}
      horizontal
      initialScrollIndex={toDisplayIndex(initialPage)}
      estimatedItemSize={width}
      onViewableItemsChanged={handleViewableItemsChanged}
      renderItem={({ item }) => (
        <MangaPageImage
          uri={item}
          requestInit={requestInit}
          theme={theme}
          width={width}
        />
      )}
      onTouchEnd={onTap}
      recycleItems
    />
  );
};

export default ContinuousMangaReader;
