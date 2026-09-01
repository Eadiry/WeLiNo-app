import React from 'react';
import { View, Pressable, TextStyle, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { ChapterInfo } from '@database/types';
import { ThemeColors } from '@theme/types';

type Styles = {
  chapterCtn: StyleProp<ViewStyle>;
  drawerElementContainer: StyleProp<ViewStyle>;
  chapterRow: StyleProp<ViewStyle>;
  chapterNameCtn: StyleProp<TextStyle>;
  releaseDateCtn: StyleProp<TextStyle>;
};

type Props = {
  item: ChapterInfo;
  index: number;
  styles: Styles;
  theme: ThemeColors;
  chapterId: number;
  /** Takes the chapter so the caller can pass a stable handler. */
  onPress: (chapter: ChapterInfo) => void;
};

/**
 * A component rather than a render function so that rows can bail out of
 * re-rendering: the chapter list is re-created whenever reading progress is
 * written, which happens continuously while a chapter is open.
 */
const RenderListChapter = ({
  item,
  index,
  styles,
  theme,
  onPress,
  chapterId,
}: Props) => {
  const isCurrentChapter = item.id === chapterId;
  const isRead = !item.unread;

  const nameColor = isCurrentChapter
    ? theme.primary
    : isRead
    ? theme.outline
    : theme.onSurface;

  return (
    <View
      style={[
        styles.drawerElementContainer,
        index % 2 === 1 && { backgroundColor: theme.surfaceVariant },
        isCurrentChapter && { backgroundColor: theme.secondaryContainer },
      ]}
    >
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        onPress={() => onPress(item)}
        style={styles.chapterRow}
      >
        <View style={styles.chapterCtn}>
          <Text
            numberOfLines={1}
            style={[styles.chapterNameCtn, { color: nameColor }]}
          >
            {item.name}
          </Text>
          {item.releaseTime ? (
            <Text
              style={[
                styles.releaseDateCtn,
                {
                  color: isCurrentChapter
                    ? theme.primary
                    : isRead
                    ? theme.outline
                    : theme.onSurfaceVariant,
                },
              ]}
            >
              {item.releaseTime}
            </Text>
          ) : null}
        </View>
        {isRead ? (
          <MaterialCommunityIcons
            name="check-circle"
            size={20}
            color={theme.primary}
          />
        ) : null}
      </Pressable>
    </View>
  );
};

export default React.memo(RenderListChapter);
