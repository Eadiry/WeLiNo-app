import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import Icon from '@react-native-vector-icons/material-design-icons';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

import { EmptyView, SafeAreaView } from '@components';
import NovelCoverImage from '@components/NovelCoverImage';
import { useTheme } from '@hooks/persisted';
import MangaTrackSheet from './components/MangaTrackSheet';
import MangaChapterRow from './components/MangaChapterRow';
import MangaReaderModePanel from '@screens/manga-reader/components/MangaReaderModePanel';

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
import type { ThemeColors } from '@theme/types';
import type { MaterialDesignIconName } from '@type/icon';

const READER_MODE_LABELS: Record<MangaRow['readerMode'], string> = {
  pagedLtr: 'Paged (left to right)',
  pagedRtl: 'Paged (right to left)',
  pagedVertical: 'Paged (vertical)',
  continuousVertical: 'Continuous (webtoon)',
  continuousLtr: 'Continuous (left to right)',
  continuousRtl: 'Continuous (right to left)',
};

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
 *
 * Layout follows Mihon's series screen: cover + title header, an
 * icon-over-label action row (favorite / track / reader mode), a
 * collapsible synopsis, a resume button, then the chapter list as
 * `MangaChapterRow`s with a sort toggle.
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
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);
  const trackSheetRef = useRef<BottomSheetModalMethods | null>(null);
  const [modePanelVisible, setModePanelVisible] = useState(false);

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

  const resumeIndex = useMemo(() => {
    const firstUnread = chapters.findIndex(
      c => !('unread' in c) || c.unread !== false,
    );
    return firstUnread === -1 ? chapters.length - 1 : firstUnread;
  }, [chapters]);

  const hasProgress = chapters.some(c => 'unread' in c && c.unread === false);

  const displayChapters = useMemo(
    () => (sortDesc ? [...chapters].reverse() : chapters),
    [chapters, sortDesc],
  );

  const genreList = useMemo(
    () =>
      (displayed?.genres ?? '')
        .split(/,\s*/)
        .map(g => g.trim())
        .filter(Boolean),
    [displayed?.genres],
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

        {genreList.length > 0 ? (
          <View style={styles.genreRow}>
            {genreList.map(genre => (
              <Text
                key={genre}
                style={[
                  styles.genreChip,
                  {
                    borderColor: theme.outline,
                    color: theme.onSurfaceVariant,
                  },
                ]}
              >
                {genre}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton
            icon={inLibrary ? 'heart' : 'heart-outline'}
            label={inLibrary ? 'In library' : 'Add'}
            active={inLibrary}
            loading={busy}
            theme={theme}
            onPress={toggleLibrary}
          />
          {dbManga ? (
            <ActionButton
              icon="sync"
              label="Track"
              theme={theme}
              onPress={() => trackSheetRef.current?.present()}
            />
          ) : null}
          {dbManga ? (
            <ActionButton
              icon="book-cog-outline"
              label={READER_MODE_LABELS[dbManga.readerMode].split(' (')[0]}
              theme={theme}
              onPress={() => setModePanelVisible(true)}
            />
          ) : null}
        </View>

        {displayed.summary ? (
          <Pressable onPress={() => setSummaryExpanded(v => !v)}>
            <Text
              numberOfLines={summaryExpanded ? undefined : 3}
              style={[styles.summary, { color: theme.onSurface }]}
            >
              {displayed.summary}
            </Text>
            <Text style={[styles.summaryToggle, { color: theme.primary }]}>
              {summaryExpanded ? 'Less' : 'More'}
            </Text>
          </Pressable>
        ) : null}

        {chapters.length > 0 ? (
          <Button
            mode="contained"
            icon="play"
            onPress={() => openChapter(resumeIndex)}
            style={styles.resumeButton}
          >
            {hasProgress ? 'Resume' : 'Start reading'}
          </Button>
        ) : null}

        <View style={styles.chapterHeader}>
          <Text
            style={[styles.sectionHeading, { color: theme.onSurfaceVariant }]}
          >
            {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
          </Text>
          <Pressable
            onPress={() => setSortDesc(v => !v)}
            hitSlop={8}
            style={styles.sortButton}
          >
            <Icon
              name={sortDesc ? 'sort-descending' : 'sort-ascending'}
              size={20}
              color={theme.onSurfaceVariant}
            />
          </Pressable>
        </View>

        {displayChapters.map((chapter, displayIndex) => {
          const originalIndex = sortDesc
            ? chapters.length - 1 - displayIndex
            : displayIndex;
          return (
            <MangaChapterRow
              key={String(chapter.id)}
              chapter={chapter}
              theme={theme}
              onPress={() => openChapter(originalIndex)}
            />
          );
        })}
      </ScrollView>
      {dbManga ? (
        <MangaTrackSheet
          bottomSheetRef={trackSheetRef}
          mangaId={dbManga.id}
          mangaName={dbManga.name}
        />
      ) : null}
      {dbManga ? (
        <MangaReaderModePanel
          visible={modePanelVisible}
          onDismiss={() => setModePanelVisible(false)}
          value={dbManga.readerMode}
          onChange={mode => {
            setReaderMode(mode);
            setModePanelVisible(false);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
};

const ActionButton = ({
  icon,
  label,
  active,
  loading,
  theme,
  onPress,
}: {
  icon: MaterialDesignIconName;
  label: string;
  active?: boolean;
  loading?: boolean;
  theme: ThemeColors;
  onPress: () => void;
}) => (
  <Pressable
    android_ripple={{ color: theme.rippleColor, borderless: true }}
    style={styles.actionButton}
    onPress={onPress}
    disabled={loading}
  >
    {loading ? (
      <ActivityIndicator size={22} color={theme.onSurfaceVariant} />
    ) : (
      <Icon
        name={icon}
        size={22}
        color={active ? theme.primary : theme.onSurfaceVariant}
      />
    )}
    <Text
      numberOfLines={1}
      style={[
        styles.actionLabel,
        { color: active ? theme.primary : theme.onSurfaceVariant },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

export default MangaScreen;

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', flex: 1, gap: 4, paddingVertical: 8 },
  actionLabel: { fontSize: 12 },
  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  centerLoading: { flex: 1, justifyContent: 'center' },
  chapterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  content: { padding: 16, paddingBottom: 48 },
  cover: { borderRadius: 6, height: 160, width: 110 },
  genreChip: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  headerDetails: { flex: 1, marginStart: 16 },
  headerRow: { flexDirection: 'row' },
  resumeButton: { marginTop: 16 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  sortButton: { padding: 4 },
  summary: { marginTop: 16 },
  summaryToggle: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  title: { fontSize: 18, fontWeight: '700' },
});
