import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import color from 'color';

import Slider from '@components/Slider/Slider';
import { EmptyView, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { useMangaReaderSettings } from '@hooks/persisted/useMangaReaderSettings';
import { useTrackedManga } from '@hooks/persisted/useTrackedManga';
import { isUrlAbsolute } from '@plugins/helpers/isAbsoluteUrl';
import { getMangaPlugin } from '@plugins/mangaPluginManager';
import { dbManager } from '@database/db';
import { mangaSchema, type MangaRow } from '@database/schema';
import { eq } from 'drizzle-orm';
import {
  markMangaChapterRead,
  setMangaChapterBookmark,
  updateMangaChapterLastPageRead,
  updateMangaChapterProgress,
} from '@database/queries/MangaChapterQueries';
import VerticalMangaReader from './components/VerticalMangaReader';
import PagedMangaReader from './components/PagedMangaReader';
import ContinuousMangaReader from './components/ContinuousMangaReader';
import MangaReaderSettingsSheet from './components/MangaReaderSettingsSheet';
import type { MangaReaderHandle } from './components/readerHandle';
import type { MangaChapterScreenProps } from '@navigators/types';

/**
 * Manga's `ReaderScreen.tsx` equivalent. Chrome hides on tap (plain local
 * state — no second consumer needs a context split yet). Prev/next moves
 * through the `chapters` array the route was given, so it works whether or
 * not the manga is in the library; progress/read-state/bookmark writes are
 * the only thing gated on a real `MangaChapter` row
 * (`typeof chapter.id === 'number'`).
 *
 * The bottom chrome follows the reference reader (and the novel
 * `ReaderFooter.tsx`): a page-seekbar row (skip-chapter circles flanking a
 * dotted slider + page count) above an action toolbar (bookmark / reading
 * mode / settings).
 */
const MangaChapterScreen = ({ route, navigation }: MangaChapterScreenProps) => {
  const theme = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { sidePadding, setMangaReaderSettings } = useMangaReaderSettings();
  const [manga, setManga] = useState(route.params.manga);
  const [chapters] = useState(route.params.chapters);
  const [index, setIndex] = useState(route.params.initialIndex);
  const [pages, setPages] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [chromeHidden, setChromeHidden] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>({});
  const readerRef = useRef<MangaReaderHandle>(null);

  const chapter = chapters[index];
  const mangaId = 'id' in manga ? manga.id : undefined;
  const readerMode: MangaRow['readerMode'] =
    'readerMode' in manga ? manga.readerMode : 'continuousVertical';

  const plugin = getMangaPlugin(manga.pluginId);
  const { updateAllTrackedManga } = useTrackedManga(mangaId ?? 'NO_ID');

  const webUrl = useMemo(() => {
    if (isUrlAbsolute(manga.pluginId)) return undefined;
    if (isUrlAbsolute(chapter.path)) return chapter.path;
    const site = plugin?.site;
    if (site && isUrlAbsolute(site)) {
      return `${site.replace(/\/$/, '')}/${chapter.path.replace(/^\//, '')}`;
    }
    return undefined;
  }, [chapter.path, manga.pluginId, plugin?.site]);

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
      if (typeof chapter.chapterNumber === 'number') {
        updateAllTrackedManga({ progress: chapter.chapterNumber });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [plugin, manga.pluginId, chapter, updateAllTrackedManga]);

  useEffect(() => {
    setCurrentPage('lastPageRead' in chapter ? chapter.lastPageRead ?? 0 : 0);
    loadChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.path]);

  const goNext = useCallback(() => {
    setIndex(i => Math.min(i + 1, chapters.length - 1));
  }, [chapters.length]);

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(i - 1, 0));
  }, []);

  const setReaderMode = useCallback(
    async (mode: MangaRow['readerMode']) => {
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
    },
    [mangaId],
  );

  const imageRequestInit = plugin?.imageRequestInit;
  const lastPageRead =
    'lastPageRead' in chapter ? chapter.lastPageRead ?? 0 : 0;

  const chapterKey = String(chapter.id);
  const bookmarked =
    bookmarks[chapterKey] ??
    ('bookmark' in chapter && chapter.bookmark === true);

  const toggleBookmark = useCallback(() => {
    const next = !bookmarked;
    setBookmarks(prev => ({ ...prev, [chapterKey]: next }));
    if (typeof chapter.id === 'number') {
      setMangaChapterBookmark(chapter.id, next);
    }
  }, [bookmarked, chapterKey, chapter.id]);

  const onVerticalProgress = useCallback(
    (percent: number, pageIndex: number) => {
      setCurrentPage(pageIndex);
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
      setCurrentPage(pageIndex);
      if (typeof chapter.id === 'number') {
        updateMangaChapterLastPageRead(chapter.id, pageIndex);
      }
    },
    [chapter],
  );

  const seekToPage = useCallback((pageIndex: number) => {
    setCurrentPage(pageIndex);
    readerRef.current?.goToPage(pageIndex);
  }, []);

  const toggleChrome = useCallback(() => setChromeHidden(v => !v), []);

  const openWebView = useCallback(() => {
    if (!webUrl) return;
    navigation.navigate('WebviewScreen', {
      name: manga.name,
      url: webUrl,
      pluginId: manga.pluginId,
    });
  }, [webUrl, manga.name, manga.pluginId, navigation]);

  const reader = useMemo(() => {
    if (!pages) return null;
    switch (readerMode) {
      case 'pagedLtr':
      case 'pagedRtl':
      case 'pagedVertical':
        return (
          <PagedMangaReader
            ref={readerRef}
            pages={pages}
            requestInit={imageRequestInit}
            theme={theme}
            initialPage={lastPageRead}
            rtl={readerMode === 'pagedRtl'}
            orientation={
              readerMode === 'pagedVertical' ? 'vertical' : 'horizontal'
            }
            sidePadding={sidePadding}
            onPageChange={onPagedChange}
            onTap={toggleChrome}
          />
        );
      case 'continuousLtr':
      case 'continuousRtl':
        return (
          <ContinuousMangaReader
            ref={readerRef}
            pages={pages}
            requestInit={imageRequestInit}
            theme={theme}
            initialPage={lastPageRead}
            rtl={readerMode === 'continuousRtl'}
            sidePadding={sidePadding}
            onProgress={onVerticalProgress}
            onTap={toggleChrome}
          />
        );
      case 'continuousVertical':
      default:
        return (
          <VerticalMangaReader
            ref={readerRef}
            pages={pages}
            requestInit={imageRequestInit}
            theme={theme}
            initialPage={lastPageRead}
            sidePadding={sidePadding}
            onProgress={onVerticalProgress}
            onTap={toggleChrome}
          />
        );
    }
  }, [
    pages,
    readerMode,
    imageRequestInit,
    theme,
    lastPageRead,
    sidePadding,
    onPagedChange,
    onVerticalProgress,
    toggleChrome,
  ]);

  const pillBg = color(theme.surface).alpha(0.95).string();

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
          {webUrl ? (
            <IconButton
              icon="earth"
              iconColor={theme.onSurface}
              onPress={openWebView}
            />
          ) : null}
          <IconButton
            icon="cog-outline"
            iconColor={theme.onSurface}
            onPress={() => setSettingsVisible(true)}
          />
        </View>
      ) : null}

      {!chromeHidden ? (
        <View style={[styles.footer, { paddingBottom: bottom + 4 }]}>
          <View style={styles.seekRow}>
            <IconButton
              icon="skip-previous"
              mode="contained"
              containerColor={pillBg}
              iconColor={theme.onSurface}
              size={20}
              disabled={index <= 0}
              onPress={goPrev}
            />
            <View style={[styles.pill, { backgroundColor: pillBg }]}>
              <Text style={[styles.pageNum, { color: theme.onSurfaceVariant }]}>
                {pages ? Math.min(currentPage + 1, pages.length) : 0}
              </Text>
              <View style={styles.slider}>
                <Slider
                  size="xs"
                  showStops={!!pages && pages.length <= 60}
                  value={currentPage}
                  min={0}
                  max={pages && pages.length > 1 ? pages.length - 1 : 1}
                  step={1}
                  onSlidingComplete={seekToPage}
                />
              </View>
              <Text style={[styles.pageNum, { color: theme.onSurfaceVariant }]}>
                {pages?.length ?? 0}
              </Text>
            </View>
            <IconButton
              icon="skip-next"
              mode="contained"
              containerColor={pillBg}
              iconColor={theme.onSurface}
              size={20}
              disabled={index >= chapters.length - 1}
              onPress={goNext}
            />
          </View>

          <View style={[styles.toolbar, { backgroundColor: theme.surface }]}>
            <IconButton
              icon={bookmarked ? 'bookmark' : 'bookmark-outline'}
              iconColor={bookmarked ? theme.primary : theme.onSurface}
              onPress={toggleBookmark}
            />
            <IconButton
              icon="book-open-page-variant-outline"
              iconColor={theme.onSurface}
              onPress={() => setSettingsVisible(true)}
            />
            <IconButton
              icon="cog-outline"
              iconColor={theme.onSurface}
              onPress={() => setSettingsVisible(true)}
            />
          </View>
        </View>
      ) : null}

      <MangaReaderSettingsSheet
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
        mode={readerMode}
        onModeChange={setReaderMode}
        sidePadding={sidePadding}
        onSidePaddingChange={v => setMangaReaderSettings({ sidePadding: v })}
      />
    </View>
  );
};

export default MangaChapterScreen;

const styles = StyleSheet.create({
  chapterName: { fontSize: 12 },
  container: { flex: 1 },
  footer: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  header: { alignItems: 'center', flexDirection: 'row' },
  headerTitles: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center' },
  mangaName: { fontSize: 14, fontWeight: '600' },
  pageNum: { fontSize: 12, minWidth: 24, textAlign: 'center' },
  pill: {
    alignItems: 'center',
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  seekRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
  },
  slider: { flex: 1, marginHorizontal: 6 },
  toolbar: {
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: 8,
    marginTop: 6,
  },
});
