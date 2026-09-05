import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@react-native-vector-icons/material-design-icons';

import type { ThemeColors } from '@theme/types';
import type { DisplayMangaChapter } from '@navigators/types';

/**
 * One chapter row on the manga details screen — Mihon's chapter-list item:
 * chapter name on top, a metadata subtitle below (release date and/or
 * scanlator), and unread/read state shown by dimming the whole row once
 * read. `unread` only exists on a persisted `MangaChapter` row; a chapter
 * from a not-yet-added manga has no read state, so it always renders as
 * unread (which is correct — nothing's been tracked for it).
 */
interface MangaChapterRowProps {
  chapter: DisplayMangaChapter;
  theme: ThemeColors;
  onPress: () => void;
}

const formatReleaseTime = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const MangaChapterRow = ({ chapter, theme, onPress }: MangaChapterRowProps) => {
  const read = 'unread' in chapter && chapter.unread === false;
  const bookmarked = 'bookmark' in chapter && chapter.bookmark === true;
  const lastPageRead =
    'lastPageRead' in chapter ? chapter.lastPageRead ?? 0 : 0;

  const subtitleParts = [
    formatReleaseTime(chapter.releaseTime),
    chapter.scanlator || undefined,
    !read && lastPageRead > 0 ? `Page ${lastPageRead + 1}` : undefined,
  ].filter(Boolean);

  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={styles.row}
      onPress={onPress}
    >
      {bookmarked ? (
        <Icon
          name="bookmark"
          size={16}
          color={theme.primary}
          style={styles.bookmarkIcon}
        />
      ) : null}
      <View style={styles.textColumn}>
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            { color: read ? theme.onSurfaceDisabled : theme.onSurface },
          ]}
        >
          {chapter.name}
        </Text>
        {subtitleParts.length > 0 ? (
          <Text
            numberOfLines={1}
            style={[
              styles.subtitle,
              {
                color: read ? theme.onSurfaceDisabled : theme.onSurfaceVariant,
              },
            ]}
          >
            {subtitleParts.join(' • ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};

export default memo(MangaChapterRow);

const styles = StyleSheet.create({
  bookmarkIcon: { marginRight: 8 },
  name: { fontSize: 14 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  subtitle: { fontSize: 12, marginTop: 2 },
  textColumn: { flex: 1 },
});
