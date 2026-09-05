import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';

interface MangaPageImageProps {
  uri: string;
  requestInit?: ImageRequestInit;
  theme: ThemeColors;
  width: number;
}

/**
 * A manga page: full-width, natural-aspect-ratio (unlike `NovelCoverImage`,
 * which is a fixed-size thumbnail — that component's prop surface doesn't
 * expose load dimensions, so this is a small dedicated component rather than
 * a wrapper on it). Renders at a guessed portrait ratio until the real image
 * reports its size on load, then locks to that — avoids a layout jump for
 * the common case while still ending up correct for both manga pages and
 * much-taller webtoon strips.
 */
const GUESSED_ASPECT_RATIO = 1 / 1.45; // width / height

const MangaPageImage = ({
  uri,
  requestInit,
  theme,
  width,
}: MangaPageImageProps) => {
  const [aspectRatio, setAspectRatio] = useState(GUESSED_ASPECT_RATIO);
  const [failed, setFailed] = useState(false);

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height: width / aspectRatio,
          backgroundColor: theme.surfaceVariant,
        },
      ]}
    >
      {failed ? (
        <MaterialCommunityIcons
          name="image-off-outline"
          color={theme.onSurfaceVariant}
          size={36}
          style={styles.icon}
        />
      ) : (
        <Image
          source={{ uri, headers: requestInit?.headers }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="disk"
          onLoad={(event: ImageLoadEventData) => {
            const { width: w, height: h } = event.source;
            if (w && h) {
              setAspectRatio(w / h);
            }
          }}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
};

export default memo(MangaPageImage);

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  icon: { opacity: 0.6 },
});
