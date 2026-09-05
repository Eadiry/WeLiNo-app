import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';

import MangaPageImage from '@components/MangaPageImage';
import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';
import type { MangaReaderHandle } from './readerHandle';
import { autoScrollStepPerTick, AUTO_SCROLL_TICK_MS } from './autoScroll';

interface ContinuousMangaReaderProps {
  pages: string[];
  requestInit?: ImageRequestInit;
  theme: ThemeColors;
  initialPage?: number;
  /** Reading direction — right-to-left reverses scroll/page order, same convention as `PagedMangaReader`'s `rtl` prop. */
  rtl?: boolean;
  /** Horizontal page inset as a fraction of screen width per side (0–0.25). */
  sidePadding?: number;
  /** When true, the strip auto-advances along its scroll axis on a timer. */
  autoScroll?: boolean;
  /** 1–10 speed level for `autoScroll`. */
  autoScrollSpeed?: number;
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
const ContinuousMangaReader = forwardRef<
  MangaReaderHandle,
  ContinuousMangaReaderProps
>(
  (
    {
      pages,
      requestInit,
      theme,
      initialPage = 0,
      rtl = false,
      sidePadding = 0,
      autoScroll = false,
      autoScrollSpeed = 5,
      onProgress,
      onTap,
    },
    ref,
  ) => {
    const { width } = useWindowDimensions();
    const pageWidth = width * (1 - sidePadding * 2);
    const listRef = useRef<LegendListRef>(null);
    const furthestRef = useRef(initialPage);
    const offsetRef = useRef(0);
    const draggingRef = useRef(false);

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

    useImperativeHandle(ref, () => ({
      goToPage: (index: number) =>
        listRef.current?.scrollToIndex({
          index: toDisplayIndex(index),
          animated: false,
        }),
    }));

    const onScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetRef.current = e.nativeEvent.contentOffset.x;
      },
      [],
    );

    useEffect(() => {
      if (!autoScroll) return;
      // A right-to-left strip scrolls toward offset 0, so advance the
      // other way for it.
      const step = autoScrollStepPerTick(autoScrollSpeed) * (rtl ? -1 : 1);
      const id = setInterval(() => {
        if (draggingRef.current) return;
        offsetRef.current = Math.max(0, offsetRef.current + step);
        listRef.current?.scrollToOffset({
          offset: offsetRef.current,
          animated: false,
        });
      }, AUTO_SCROLL_TICK_MS);
      return () => clearInterval(id);
    }, [autoScroll, autoScrollSpeed, rtl]);

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
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          draggingRef.current = true;
        }}
        onScrollEndDrag={() => {
          draggingRef.current = false;
        }}
        renderItem={({ item }) => (
          <View style={[styles.slot, { width }]}>
            <MangaPageImage
              uri={item}
              requestInit={requestInit}
              theme={theme}
              width={pageWidth}
            />
          </View>
        )}
        onTouchEnd={onTap}
        recycleItems
      />
    );
  },
);

ContinuousMangaReader.displayName = 'ContinuousMangaReader';

export default ContinuousMangaReader;

const styles = StyleSheet.create({
  slot: { alignItems: 'center' },
});
