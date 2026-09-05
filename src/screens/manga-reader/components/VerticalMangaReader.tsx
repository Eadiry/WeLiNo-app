import { useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';

import MangaPageImage from '@components/MangaPageImage';
import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';

interface VerticalMangaReaderProps {
  pages: string[];
  requestInit?: ImageRequestInit;
  theme: ThemeColors;
  initialPage?: number;
  /** Furthest page seen, as a 0-100 percentage (mirrors the novel reader's scroll-% `progress` field) and the raw page index (`lastPageRead`). */
  onProgress: (percent: number, pageIndex: number) => void;
  onTap?: () => void;
}

/**
 * Continuous vertical scroll — the manhua/manhwa mode. One `MangaPageImage`
 * per row via `@legendapp/list` (this app's standard virtualized list,
 * already used everywhere else). Progress is "furthest visible page",
 * tracked the same way `FlatList.onViewableItemsChanged` would.
 */
const VerticalMangaReader = ({
  pages,
  requestInit,
  theme,
  initialPage = 0,
  onProgress,
  onTap,
}: VerticalMangaReaderProps) => {
  const { width } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  const furthestRef = useRef(initialPage);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const maxIndex = viewableItems.reduce(
        (max, item) => (item.index != null ? Math.max(max, item.index) : max),
        furthestRef.current,
      );
      if (maxIndex > furthestRef.current) {
        furthestRef.current = maxIndex;
        const percent = pages.length
          ? Math.round(((maxIndex + 1) / pages.length) * 100)
          : 0;
        onProgress(percent, maxIndex);
      }
    },
    [pages.length, onProgress],
  );

  return (
    <LegendList
      ref={listRef}
      data={pages}
      keyExtractor={(item, index) => `${index}-${item}`}
      initialScrollIndex={initialPage}
      estimatedItemSize={width * 1.45}
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

export default VerticalMangaReader;
