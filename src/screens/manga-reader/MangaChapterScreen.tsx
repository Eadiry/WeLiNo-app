import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyView, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { getMangaPlugin } from '@plugins/mangaPluginManager';
import { dbManager } from '@database/db';
import {
  mangaSchema,
  type MangaChapterRow,
  type MangaRow,
} from '@database/schema';
import { eq } from 'drizzle-orm';
import {
  getNextMangaChapter,
  getPrevMangaChapter,
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
 */
const MangaChapterScreen = ({ route, navigation }: MangaChapterScreenProps) => {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  const [manga, setManga] = useState<MangaRow>(route.params.manga);
  const [chapter, setChapter] = useState<MangaChapterRow>(route.params.chapter);
  const [pages, setPages] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [chromeHidden, setChromeHidden] = useState(false);

  const plugin = getMangaPlugin(manga.pluginId);

  const loadChapter = useCallback(
    async (target: MangaChapterRow) => {
      setPages(undefined);
      setError(undefined);
      try {
        if (!plugin) {
          throw new Error(`Plugin ${manga.pluginId} is not loaded.`);
        }
        const res = await plugin.parseChapter(target.path);
        setPages(res.pages);
        markMangaChapterRead(target.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [plugin, manga.pluginId],
  );

  useEffect(() => {
    loadChapter(chapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  const goToChapter = useCallback((next: MangaChapterRow | undefined) => {
    if (!next) return;
    setChapter(next);
  }, []);

  const goNext = useCallback(async () => {
    goToChapter(await getNextMangaChapter(manga.id, chapter.position));
  }, [manga.id, chapter.position, goToChapter]);

  const goPrev = useCallback(async () => {
    goToChapter(await getPrevMangaChapter(manga.id, chapter.position));
  }, [manga.id, chapter.position, goToChapter]);

  const toggleReaderMode = useCallback(async () => {
    const mode = manga.readerMode === 'paged' ? 'vertical' : 'paged';
    await dbManager.write(async tx => {
      tx.update(mangaSchema)
        .set({ readerMode: mode })
        .where(eq(mangaSchema.id, manga.id))
        .run();
    });
    setManga(prev => ({ ...prev, readerMode: mode }));
  }, [manga.id, manga.readerMode]);

  const imageRequestInit = plugin?.imageRequestInit;

  const onVerticalProgress = useCallback(
    (percent: number, pageIndex: number) => {
      updateMangaChapterProgress(chapter.id, percent);
      updateMangaChapterLastPageRead(chapter.id, pageIndex);
      if (percent >= 100) {
        goNext();
      }
    },
    [chapter.id, goNext],
  );

  const onPagedChange = useCallback(
    (pageIndex: number) => {
      updateMangaChapterLastPageRead(chapter.id, pageIndex);
      if (pages && pageIndex >= pages.length - 1) {
        // Last page reached — leave advancing to an explicit next-chapter tap
        // rather than auto-turning past the end of the pager.
      }
    },
    [chapter.id, pages],
  );

  const toggleChrome = useCallback(() => setChromeHidden(v => !v), []);

  const reader = useMemo(() => {
    if (!pages) return null;
    return manga.readerMode === 'paged' ? (
      <PagedMangaReader
        pages={pages}
        requestInit={imageRequestInit}
        theme={theme}
        initialPage={chapter.lastPageRead ?? 0}
        onPageChange={onPagedChange}
        onTap={toggleChrome}
      />
    ) : (
      <VerticalMangaReader
        pages={pages}
        requestInit={imageRequestInit}
        theme={theme}
        initialPage={chapter.lastPageRead ?? 0}
        onProgress={onVerticalProgress}
        onTap={toggleChrome}
      />
    );
  }, [
    pages,
    manga.readerMode,
    imageRequestInit,
    theme,
    chapter.lastPageRead,
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
              {
                iconName: 'refresh',
                title: 'Retry',
                onPress: () => loadChapter(chapter),
              },
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
              manga.readerMode === 'paged'
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
            onPress={goPrev}
          />
          <IconButton
            icon="chevron-right"
            iconColor={theme.onSurface}
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
