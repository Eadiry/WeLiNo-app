import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

import { EmptyView, SafeAreaView, SegmentedControl } from '@components';
import NovelCoverImage from '@components/NovelCoverImage';
import { useTheme } from '@hooks/persisted';
import MangaTrackSheet from './components/MangaTrackSheet';

import { dbManager } from '@database/db';
import { mangaSchema, type MangaRow } from '@database/schema';
import {
  fetchManga,
  getMangaByPath,
  switchMangaToLibraryQuery,
} from '@database/queries/MangaQueries';
import { getMangaChaptersFromDb } from '@database/queries/MangaChapterQueries';
import { getMangaPlugin } from '@plugins/mangaPluginManager';
import type { SourceManga } from '@plugins/types/manga';
import { eq } from 'drizzle-orm';
import type { DisplayMangaChapter, MangaScreenProps } from '@navigators/types';

/**
 * Manga's `NovelScreen.tsx`/`NovelContext.tsx` mirror — deliberately a plain
 * `useState`/`useEffect` screen rather than the novel reader's Zustand store
 * (`useNovel/store/`): that store exists to serve the reader's chapter
 * navigation/prefetching, which doesn't exist yet (Phase 3). Series detail +
 * chapter list + library toggle + reader-mode toggle don't need it.
 *
 * Mirrors `switchNovelToLibraryQuery`'s "not in DB until added" model for
 * metadata: a manga opened from Browse is fetched live from its plugin and
 * shown transiently until added to the library, at which point it's
 * persisted and re-read from the DB. Reading itself, though, does NOT
 * require adding to the library first — `MangaChapterScreen` degrades
 * gracefully (no progress/read-state persistence) when a chapter has no DB
 * row yet, same as it would for a chapter belonging to a manga that's since
 * been removed from the library.
 */
const MangaScreen = ({ route, navigation }: MangaScreenProps) => {
  const theme = useTheme();
  const params = route.params;
  const isDbRow = 'id' in params;
  const pluginId = params.pluginId;
  const path = isDbRow ? params.path : params.path;

  const [dbManga, setDbManga] = useState<MangaRow | undefined>(
    isDbRow ? (params as MangaRow) : getMangaByPath(path, pluginId),
  );
  const [sourceManga, setSourceManga] = useState<SourceManga>();
  const [isLoading, setIsLoading] = useState(!dbManga);
  const [error, setError] = useState<string>();
  const [chapters, setChapters] = useState<DisplayMangaChapter[]>([]);
  const [busy, setBusy] = useState(false);
  const trackSheetRef = useRef<BottomSheetModalMethods | null>(null);

  const plugin = getMangaPlugin(pluginId);

  const load = useCallback(async () => {
    const existing = getMangaByPath(path, pluginId);
    if (existing) {
      setDbManga(existing);
      setIsLoading(false);
      const rows = await getMangaChaptersFromDb(existing.id);
      setChapters(rows);
      return;
    }
    setIsLoading(true);
    setError(undefined);
    try {
      const res = await fetchManga(pluginId, path);
      setSourceManga(res);
      setChapters(res.chapters.map((c, i) => ({ ...c, id: `${i}-${c.path}` })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [path, pluginId]);

  useEffect(() => {
    load();
  }, [load]);

  const displayed = dbManga ?? sourceManga;

  const toggleLibrary = useCallback(async () => {
    setBusy(true);
    try {
      await switchMangaToLibraryQuery(path, pluginId);
      await load();
    } finally {
      setBusy(false);
    }
  }, [path, pluginId, load]);

  const setReaderMode = useCallback(
    async (mode: MangaRow['readerMode']) => {
      if (!dbManga) return;
      await dbManager.write(async tx => {
        tx.update(mangaSchema)
          .set({ readerMode: mode })
          .where(eq(mangaSchema.id, dbManga.id))
          .run();
      });
      setDbManga({ ...dbManga, readerMode: mode });
    },
    [dbManga],
  );

  const openChapter = useCallback(
    (index: number) => {
      navigation.navigate('MangaChapterScreen', {
        manga: dbManga ?? {
          path,
          pluginId,
          name: displayed?.name ?? path,
          cover: displayed?.cover,
        },
        chapters,
        initialIndex: index,
      });
    },
    [dbManga, path, pluginId, displayed, chapters, navigation],
  );

  if (isLoading) {
    return (
      <SafeAreaView>
        <ActivityIndicator style={styles.centerLoading} />
      </SafeAreaView>
    );
  }

  if (!displayed) {
    return (
      <SafeAreaView>
        <EmptyView
          description={error ?? 'Could not load this manga.'}
          theme={theme}
        />
      </SafeAreaView>
    );
  }

  const inLibrary = Boolean(dbManga?.inLibrary);

  return (
    <SafeAreaView>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <NovelCoverImage
            uri={displayed.cover}
            requestInit={plugin?.imageRequestInit}
            theme={theme}
            style={styles.cover}
          />
          <View style={styles.headerDetails}>
            <Text style={[styles.title, { color: theme.onSurface }]}>
              {displayed.name}
            </Text>
            {displayed.author ? (
              <Text style={{ color: theme.onSurfaceVariant }}>
                {displayed.author}
              </Text>
            ) : null}
            {displayed.status ? (
              <Text style={{ color: theme.onSurfaceVariant }}>
                {displayed.status}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Button
            mode={inLibrary ? 'outlined' : 'contained'}
            onPress={toggleLibrary}
            loading={busy}
            disabled={busy}
            style={styles.libraryButton}
          >
            {inLibrary ? 'In library' : 'Add to library'}
          </Button>
          {dbManga ? (
            <Button
              mode="outlined"
              onPress={() => trackSheetRef.current?.present()}
              style={styles.libraryButton}
            >
              Track
            </Button>
          ) : null}
        </View>

        {dbManga ? (
          <View style={styles.readerModeRow}>
            <Text
              style={[styles.sectionHeading, { color: theme.onSurfaceVariant }]}
            >
              Reader mode
            </Text>
            <SegmentedControl<'paged' | 'vertical'>
              options={[
                { value: 'vertical', label: 'Vertical (manhua/manhwa)' },
                { value: 'paged', label: 'Paged (manga)' },
              ]}
              value={dbManga.readerMode}
              onChange={setReaderMode}
              theme={theme}
            />
          </View>
        ) : null}

        {displayed.genres ? (
          <Text style={[styles.genres, { color: theme.onSurfaceVariant }]}>
            {displayed.genres}
          </Text>
        ) : null}
        {displayed.summary ? (
          <Text style={[styles.summary, { color: theme.onSurface }]}>
            {displayed.summary}
          </Text>
        ) : null}

        <Text
          style={[styles.sectionHeading, { color: theme.onSurfaceVariant }]}
        >
          {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
        </Text>
        {chapters.map((chapter, index) => (
          <Text
            key={String(chapter.id)}
            onPress={() => openChapter(index)}
            style={[styles.chapterRow, { color: theme.onSurface }]}
          >
            {chapter.name}
          </Text>
        ))}
      </ScrollView>
      {dbManga ? (
        <MangaTrackSheet
          bottomSheetRef={trackSheetRef}
          mangaId={dbManga.id}
          mangaName={dbManga.name}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default MangaScreen;

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: 8 },
  centerLoading: { flex: 1, justifyContent: 'center' },
  chapterRow: { paddingVertical: 10 },
  content: { padding: 16 },
  cover: { borderRadius: 6, height: 150, width: 100 },
  genres: { fontSize: 12, marginTop: 8 },
  headerDetails: { flex: 1, marginStart: 16 },
  headerRow: { flexDirection: 'row' },
  libraryButton: { flex: 1, marginTop: 16 },
  readerModeRow: { marginTop: 16 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  summary: { marginTop: 8 },
  title: { fontSize: 18, fontWeight: '700' },
});
