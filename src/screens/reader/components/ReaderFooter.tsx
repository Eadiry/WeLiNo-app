import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import color from 'color';
import Animated, {
  Easing,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';
import { useChapterContext } from '../ChapterContext';
import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import { useNovelLayout } from '@screens/novel/NovelContext';
import { Slider } from '@components';
import { getString } from '@i18n/translations';
import { ThemeColors } from '@theme/types';

interface ChapterFooterProps {
  openDrawer: () => void;
  /** Reading progress, 0–100. */
  progress: number;
  /** Seek to a 0–1 position in the chapter. */
  onSeek: (ratio: number) => void;
  novelName: string;
  chapterName: string;
}

const fastOutSlowIn = Easing.bezier(0.4, 0.0, 0.2, 1.0);

const createEntering = (navigationBarHeight: number) => () => {
  'worklet';
  const animations = {
    transform: [
      {
        translateY: withTiming(0, {
          duration: 250,
          easing: fastOutSlowIn,
          reduceMotion: ReduceMotion.System,
        }),
      },
    ],
    opacity: withTiming(1, { duration: 150 }),
  };
  const initialValues = {
    transform: [{ translateY: 160 + navigationBarHeight }],
    opacity: 0,
  };
  return { initialValues, animations };
};

const createExiting = (navigationBarHeight: number) => () => {
  'worklet';
  const animations = {
    transform: [
      {
        translateY: withTiming(160 + navigationBarHeight, {
          duration: 250,
          easing: fastOutSlowIn,
          reduceMotion: ReduceMotion.System,
        }),
      },
    ],
    opacity: withTiming(0, { duration: 150 }),
  };
  const initialValues = {
    transform: [{ translateY: 0 }],
    opacity: 1,
  };
  return { initialValues, animations };
};

const ChapterFooter = ({
  openDrawer,
  progress,
  onSeek,
  novelName,
  chapterName,
}: ChapterFooterProps) => {
  const { nextChapter, prevChapter, navigateChapter } = useChapterContext();
  const theme = useTheme();
  const { pageReader = false, setChapterGeneralSettings } =
    useChapterGeneralSettings();
  const { navigationBarHeight } = useNovelLayout();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const containerStyle = useMemo(
    () => [
      styles.footer,
      {
        backgroundColor: color(theme.surface).alpha(0.95).string(),
        paddingBottom: navigationBarHeight + 8,
      },
    ],
    [styles.footer, theme.surface, navigationBarHeight],
  );

  const entering = useMemo(
    () => createEntering(navigationBarHeight),
    [navigationBarHeight],
  );
  const exiting = useMemo(
    () => createExiting(navigationBarHeight),
    [navigationBarHeight],
  );

  const ratio = Math.min(1, Math.max(0, progress / 100));

  return (
    <Animated.View entering={entering} exiting={exiting} style={containerStyle}>
      <Text style={styles.percentage}>{Math.round(ratio * 100)}%</Text>
      <View style={styles.seekRow}>
        <IconButton
          icon="chevron-left"
          size={26}
          disabled={!prevChapter}
          iconColor={theme.onSurface}
          onPress={() => navigateChapter('PREV')}
        />
        <View style={styles.slider}>
          <Slider
            size="xs"
            value={ratio}
            min={0}
            max={1}
            step={0.001}
            onSlidingComplete={onSeek}
            accessibilityLabel={getString(
              'readerScreen.bottomSheet.showProgressPercentage',
            )}
            formatValue={v => `${Math.round(v * 100)}%`}
          />
        </View>
        <IconButton
          icon="chevron-right"
          size={26}
          disabled={!nextChapter}
          iconColor={theme.onSurface}
          onPress={() => navigateChapter('NEXT')}
        />
      </View>

      <Text style={styles.novelName} numberOfLines={1}>
        {novelName}
      </Text>
      <Text style={styles.chapterName} numberOfLines={1}>
        {chapterName}
      </Text>

      <View style={styles.actionsRow}>
        <IconButton
          icon="format-list-bulleted"
          size={24}
          iconColor={theme.onSurface}
          onPress={openDrawer}
        />
        <View style={styles.segment}>
          <Pressable
            style={[
              styles.segmentItem,
              !pageReader && { backgroundColor: theme.primary },
            ]}
            onPress={() => setChapterGeneralSettings({ pageReader: false })}
          >
            <Text
              style={[
                styles.segmentText,
                { color: !pageReader ? theme.onPrimary : theme.onSurface },
              ]}
            >
              {getString('readerScreen.panel.scroll')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.segmentItem,
              pageReader && { backgroundColor: theme.primary },
            ]}
            onPress={() => setChapterGeneralSettings({ pageReader: true })}
          >
            <Text
              style={[
                styles.segmentText,
                { color: pageReader ? theme.onPrimary : theme.onSurface },
              ]}
            >
              {getString('readerScreen.panel.page')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.actionsSpacer} />
      </View>
    </Animated.View>
  );
};

export default React.memo(ChapterFooter);

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    footer: {
      bottom: 0,
      position: 'absolute',
      width: '100%',
      zIndex: 1,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    percentage: {
      color: theme.onSurfaceVariant,
      textAlign: 'center',
      fontSize: 12,
      marginBottom: 2,
    },
    seekRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    slider: {
      flex: 1,
      marginHorizontal: 4,
    },
    novelName: {
      color: theme.onSurface,
      textAlign: 'center',
      fontSize: 14,
      marginTop: 4,
    },
    chapterName: {
      color: theme.onSurfaceVariant,
      textAlign: 'center',
      fontSize: 12,
      marginBottom: 4,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    actionsSpacer: {
      width: 48,
    },
    segment: {
      flexDirection: 'row',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: theme.surfaceVariant,
    },
    segmentItem: {
      paddingVertical: 6,
      paddingHorizontal: 20,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
