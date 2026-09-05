import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyView, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { useTrackedManga } from '@hooks/persisted/useTrackedManga';
import { getMangaPlugin } from '@plugins/mangaPluginManager';
import { dbManager } from '@database/db';
import { mangaSchema, type MangaRow } from '@database/schema';
import { eq } from 'drizzle-orm';
import {
  markMangaChapterRead,
  updateMangaChapterLastPageRead,
  updateMangaChapterProgress,
} from '@database/queries/MangaChapterQueries';
import VerticalMangaReader from './components/VerticalMangaReader';
import PagedMangaReader from './components/PagedMangaReader';
import type { MangaChapterScreenProps } from '@navigators/types';

/**
 * Manga's `ReaderScreen.tsx` equivalent — much simpler, since there's no
 * WebView/TTS/injected-JS machinery to coordinate, just "fetch a page list,
 * hand it to whichever reader component `manga.readerMode` picks." Chrome
 * (title + reader-mode toggle) hides on tap, same convention as the novel
 * reader's `ReaderChromeHiddenContext`, but as plain local state — there's
 * no second consumer that would need it split out into its own context yet.
 *
 * Prev/next navigation moves through the `chapters` array the route was
 * given rather than querying the DB — works identically whether or not the
 * manga is in the library. Progress/read-state persistence is the only
 * thing that's conditional: it only writes when the current chapter has a
 * numeric `id` (a real `MangaChapter` row exists), which is exactly the
 * "added to library" case. A not-yet-added manga is still fully readable;
 * it just doesn't remember where you left off.
 */
const MangaChapterScreen = ({ route, navigation }: MangaChapterScreenProps) => {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  const [manga, setManga] = useState(route.params.manga);
  const [chapters] = useState(route.params.chapters);
  const [index, setIndex] = useState(route.params.initialIndex);
  const [pages, setPages] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [chromeHidden, setChromeHidden] = useState(false);

  const chapter = chapters[index];
  const mangaId = 'id' in manga ? manga.id : undefined;
  const readerMode: MangaRow['readerMode'] =
    'readerMode' in manga ? manga.readerMode : 'vertical';

  const plugin = getMangaPlugin(manga.pluginId);
  const { updateAllTrackedManga } = useTrackedManga(mangaId ?? 'NO_ID');

  const loadChapter = useCallback(async () => {
    setPages(undefined);
    setError(undefined);
    try {
      if (!plugin) {
        throw new Error(`Plugin ${manga.pluginId} is not loaded.`);
      }
      const res = await plugin.parseChapter(chapter.path);
      setPages(res.pages);
      if (typeof chapter.id === 'number') {
        markMangaChapterRead(chapter.id);
      }
      // Manga has no scroll-percentage concept to gate on (unlike the
      // novel reader's `useChapter.ts`'s 97%-read threshold) — a chapter
      // is either being read or it isn't, so push progress to any
      // authenticated tracker as soon as it loads.
      if (typeof chapter.chapterNumber === 'number') {
        updateAllTrackedManga({ progress: chapter.chapterNumber });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [plugin, manga.pluginId, chapter, updateAllTrackedManga]);

  useEffect(() => {
    loadChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.path]);

  const goNext = useCallback(() => {
    setIndex(i => Math.min(i + 1, chapters.length - 1));
  }, [chapters.length]);

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(i - 1, 0));
  }, []);

  const toggleReaderMode = useCallback(async () => {
    const mode = readerMode === 'paged' ? 'vertical' : 'paged';
    if (mangaId !== undefined) {
      await dbManager.write(async tx => {
        tx.update(mangaSchema)
          .set({ readerMode: mode })
          .where(eq(mangaSchema.id, mangaId))
          .run();
      });
    }
    setManga(prev =>
      'readerMode' in prev ? { ...prev, readerMode: mode } : prev,
    );
  }, [mangaId, readerMode]);

  const imageRequestInit = plugin?.imageRequestInit;
  const lastPageRead =
    'lastPageRead' in chapter ? chapter.lastPageRead ?? 0 : 0;

  const onVerticalProgress = useCallback(
    (percent: number, pageIndex: number) => {
      if (typeof chapter.id === 'number') {
        updateMangaChapterProgress(chapter.id, percent);
        updateMangaChapterLastPageRead(chapter.id, pageIndex);
      }
      if (percent >= 100) {
        goNext();
      }
    },
    [chapter, goNext],
  );

  const onPagedChange = useCallback(
    (pageIndex: number) => {
      if (typeof chapter.id === 'number') {
        updateMangaChapterLastPageRead(chapter.id, pageIndex);
      }
    },
    [chapter],
  );

  const toggleChrome = useCallback(() => setChromeHidden(v => !v), []);

  const reader = useMemo(() => {
    if (!pages) return null;
    return readerMode === 'paged' ? (
      <PagedMangaReader
        pages={pages}
        requestInit={imageRequestInit}
        theme={theme}
        initialPage={lastPageRead}
        onPageChange={onPagedChange}
        onTap={toggleChrome}
      />
    ) : (
      <VerticalMangaReader
        pages={pages}
        requestInit={imageRequestInit}
        theme={theme}
        initialPage={lastPageRead}
        onProgress={onVerticalProgress}
        onTap={toggleChrome}
      />
    );
  }, [
    pages,
    readerMode,
    imageRequestInit,
    theme,
    lastPageRead,
    onPagedChange,
    onVerticalProgress,
    toggleChrome,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar hidden={chromeHidden} />
      {error ? (
        <SafeAreaView>
          <EmptyView
            description={error}
            theme={theme}
            actions={[
              { iconName: 'refresh', title: 'Retry', onPress: loadChapter },
            ]}
          />
        </SafeAreaView>
      ) : !pages ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        reader
      )}
      {!chromeHidden ? (
        <View
          style={[
            styles.header,
            { paddingTop: top, backgroundColor: theme.surface },
          ]}
        >
          <IconButton
            icon="arrow-left"
            iconColor={theme.onSurface}
            onPress={() => navigation.canGoBack() && navigation.goBack()}
          />
          <View style={styles.headerTitles}>
            <Text
              numberOfLines={1}
              style={[styles.mangaName, { color: theme.onSurface }]}
            >
              {manga.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.chapterName, { color: theme.onSurfaceVariant }]}
            >
              {chapter.name}
            </Text>
          </View>
          <IconButton
            icon={
              readerMode === 'paged'
                ? 'book-open-page-variant-outline'
                : 'file-image-outline'
            }
            iconColor={theme.onSurface}
            onPress={toggleReaderMode}
          />
        </View>
      ) : null}
      {!chromeHidden ? (
        <View style={[styles.footer, { backgroundColor: theme.surface }]}>
          <IconButton
            icon="chevron-left"
            iconColor={theme.onSurface}
            disabled={index <= 0}
            onPress={goPrev}
          />
          <IconButton
            icon="chevron-right"
            iconColor={theme.onSurface}
            disabled={index >= chapters.length - 1}
            onPress={goNext}
          />
        </View>
      ) : null}
    </View>
  );
};

export default MangaChapterScreen;

const styles = StyleSheet.create({
  chapterName: { fontSize: 12 },
  container: { flex: 1 },
  footer: {
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  header: { alignItems: 'center', flexDirection: 'row' },
  headerTitles: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center' },
  mangaName: { fontSize: 14, fontWeight: '600' },
});
