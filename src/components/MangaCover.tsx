import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import NovelCoverImage from './NovelCoverImage';
import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { getString } from '@i18n/translations';
import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';

/**
 * Manga's `NovelCover.tsx` mirror, deliberately smaller: no display-mode
 * variants (list/compact/comfortable) — those hang off novel-specific
 * settings/contexts (`NovelCoverLayoutContext`, `DisplayModes`) this phase
 * has no equivalent for. Reuses `NovelCoverImage` as-is; it's already
 * content-agnostic. The top-left unread/download pill is ported straight
 * from `NovelCover.tsx` (same Mihon-style split-pill look) — the counts
 * only exist on a DB row (library/known items), so they're read via an
 * optional-field guard and simply absent on plain browse-search results.
 */
interface MangaCoverItem {
  name: string;
  cover?: string | null;
  chaptersUnread?: number | null;
  chaptersDownloaded?: number | null;
}

interface MangaCoverProps<TManga extends MangaCoverItem> {
  item: TManga;
  onPress: () => void;
  onLongPress?: (item: TManga) => void;
  libraryStatus?: boolean;
  theme: ThemeColors;
  width: number;
  height: number;
  imageRequestInit?: ImageRequestInit;
}

const UnreadBadge = ({
  count,
  hasDownloadBadge,
  theme,
}: {
  count: number;
  hasDownloadBadge: boolean;
  theme: ThemeColors;
}) => (
  <Text
    style={[
      styles.badge,
      hasDownloadBadge ? styles.rightHalfBadge : styles.standaloneBadge,
      { backgroundColor: theme.primary, color: theme.onPrimary },
    ]}
  >
    {count}
  </Text>
);

const DownloadBadge = ({
  count,
  hasUnreadBadge,
  theme,
}: {
  count: number;
  hasUnreadBadge: boolean;
  theme: ThemeColors;
}) => (
  <Text
    style={[
      styles.badge,
      hasUnreadBadge ? styles.leftHalfBadge : styles.standaloneBadge,
      { backgroundColor: theme.tertiary, color: theme.onTertiary },
    ]}
  >
    {count}
  </Text>
);

function MangaCover<TManga extends MangaCoverItem>({
  item,
  onPress,
  onLongPress,
  libraryStatus,
  theme,
  width,
  height,
  imageRequestInit,
}: MangaCoverProps<TManga>) {
  const requestInit = useMemo<ImageRequestInit>(
    () => ({
      ...imageRequestInit,
      headers: imageRequestInit?.headers || { 'User-Agent': getUserAgent() },
    }),
    [imageRequestInit],
  );

  const unreadCount = item.chaptersUnread ?? 0;
  const downloadCount = item.chaptersDownloaded ?? 0;

  return (
    <View style={[styles.container, { width }]}>
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        style={styles.pressable}
        onPress={onPress}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      >
        <View style={styles.badgeContainer}>
          {libraryStatus ? (
            <Text
              style={[
                styles.badge,
                styles.standaloneBadge,
                { backgroundColor: theme.primary, color: theme.onPrimary },
              ]}
            >
              {getString('novelScreen.inLibaray')}
            </Text>
          ) : null}
          {downloadCount > 0 ? (
            <DownloadBadge
              count={downloadCount}
              hasUnreadBadge={unreadCount > 0}
              theme={theme}
            />
          ) : null}
          {unreadCount > 0 ? (
            <UnreadBadge
              count={unreadCount}
              hasDownloadBadge={downloadCount > 0}
              theme={theme}
            />
          ) : null}
        </View>
        <NovelCoverImage
          uri={item.cover}
          requestInit={requestInit}
          theme={theme}
          iconSize={36}
          style={[
            { height },
            styles.borderRadius,
            libraryStatus && styles.dimmed,
          ]}
        />
        <View style={styles.titleContainer}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.linearGradient}
          >
            <Text numberOfLines={2} style={styles.title}>
              {item.name}
            </Text>
          </LinearGradient>
        </View>
      </Pressable>
    </View>
  );
}

export default memo(MangaCover) as typeof MangaCover;

const styles = StyleSheet.create({
  badge: {
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeContainer: {
    flexDirection: 'row',
    left: 10,
    position: 'absolute',
    top: 10,
    zIndex: 1,
  },
  borderRadius: { borderRadius: 4 },
  container: { borderRadius: 6, margin: 2, overflow: 'hidden' },
  dimmed: { opacity: 0.5 },
  leftHalfBadge: { borderBottomLeftRadius: 4, borderTopLeftRadius: 4 },
  linearGradient: { borderRadius: 4 },
  rightHalfBadge: { borderBottomRightRadius: 4, borderTopRightRadius: 4 },
  standaloneBadge: { borderRadius: 4 },
  pressable: { borderRadius: 4, flex: 1, padding: 4.8 },
  title: {
    color: 'rgba(255,255,255,1)',
    fontFamily: 'pt-sans-bold',
    fontSize: 14,
    padding: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  titleContainer: {
    borderRadius: 4,
    bottom: 4,
    left: 4,
    position: 'absolute',
    right: 4,
  },
});
