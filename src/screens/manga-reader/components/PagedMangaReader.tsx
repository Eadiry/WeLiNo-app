import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import MangaPageImage from '@components/MangaPageImage';
import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';
import type { MangaReaderHandle } from './readerHandle';

const MAX_SCALE = 4;

/**
 * One paged page, pinch-zoomable — the first use of gesture-handler
 * pinch/pan + reanimated shared values anywhere in this app (no existing
 * image-viewer precedent to lift from; see the manga feature plan). Pan is
 * only meaningful once zoomed in, so it's composed with pinch via
 * `Gesture.Simultaneous` rather than always-active — otherwise a one-finger
 * pan would fight the pager's own swipe-to-turn-page gesture.
 */
const ZoomablePage = ({
  uri,
  requestInit,
  theme,
  width,
  height,
  onTap,
}: {
  uri: string;
  requestInit?: ImageRequestInit;
  theme: ThemeColors;
  width: number;
  height: number;
  onTap?: () => void;
}) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate(event => {
      scale.value = Math.min(
        Math.max(savedScale.value * event.scale, 1),
        MAX_SCALE,
      );
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        reset();
      }
    });

  const pan = Gesture.Pan()
    .onUpdate(event => {
      if (savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)();
    });

  const taps = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Simultaneous(Gesture.Race(taps, pan), pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <MangaPageImage
          uri={uri}
          requestInit={requestInit}
          theme={theme}
          width={width}
        />
      </Animated.View>
    </GestureDetector>
  );
};

interface PagedMangaReaderProps {
  pages: string[];
  requestInit?: ImageRequestInit;
  theme: ThemeColors;
  initialPage?: number;
  rtl?: boolean;
  /** `'vertical'` flips page-to-page navigation to swipe up/down instead of left/right — `react-native-pager-view` supports this natively via its own `orientation` prop, independent of `rtl` (which has no meaning for a vertical pager). */
  orientation?: 'horizontal' | 'vertical';
  /** Horizontal page inset as a fraction of screen width per side (0–0.25). */
  sidePadding?: number;
  onPageChange: (pageIndex: number) => void;
  onTap?: () => void;
}

/**
 * Page-to-page navigation via `react-native-pager-view` — the manga
 * (non-webtoon) mode. `rtl` flips swipe direction for right-to-left manga.
 * Exposes a `goToPage` imperative handle so the chapter screen's seekbar
 * can jump pages (`react-native-pager-view`'s own `setPage`).
 */
const PagedMangaReader = forwardRef<MangaReaderHandle, PagedMangaReaderProps>(
  (
    {
      pages,
      requestInit,
      theme,
      initialPage = 0,
      rtl = false,
      orientation = 'horizontal',
      sidePadding = 0,
      onPageChange,
      onTap,
    },
    ref,
  ) => {
    const { width, height } = useWindowDimensions();
    const pageWidth = width * (1 - sidePadding * 2);
    const [current, setCurrent] = useState(initialPage);
    const pagerRef = useRef<PagerView>(null);

    useImperativeHandle(ref, () => ({
      goToPage: (index: number) => pagerRef.current?.setPage(index),
    }));

    return (
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialPage}
        orientation={orientation}
        layoutDirection={rtl ? 'rtl' : 'ltr'}
        onPageSelected={event => {
          const index = event.nativeEvent.position;
          setCurrent(index);
          onPageChange(index);
        }}
      >
        {pages.map((uri, index) => (
          <View key={`${index}-${uri}`} style={styles.page} collapsable={false}>
            {Math.abs(index - current) <= 1 ? (
              <ZoomablePage
                uri={uri}
                requestInit={requestInit}
                theme={theme}
                width={pageWidth}
                height={height}
                onTap={onTap}
              />
            ) : null}
          </View>
        ))}
      </PagerView>
    );
  },
);

PagedMangaReader.displayName = 'PagedMangaReader';

export default PagedMangaReader;

const styles = StyleSheet.create({
  page: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  pager: { flex: 1 },
});
