import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  IconButton,
  Menu,
} from 'react-native-paper';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import color from 'color';
import Icon from '@react-native-vector-icons/material-design-icons';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyView } from '@components';
import NovelCoverImage from '@components/NovelCoverImage';
import { useAppSettings, useTheme } from '@hooks/persisted';
import { isUrlAbsolute } from '@plugins/helpers/isAbsoluteUrl';
import { showToast } from '@utils/showToast';
import MangaTrackSheet from './components/MangaTrackSheet';
import MangaChapterRow from './components/MangaChapterRow';

import type { MangaRow } from '@database/schema';
import {
  fetchManga,
  getMangaByPath,
  switchMangaToLibraryQuery,
} from '@database/queries/MangaQueries';
import {
  getMangaChaptersFromDb,
  insertMangaChapters,
} from '@database/queries/MangaChapterQueries';
import { getMangaPlugin } from '@plugins/mangaPluginManager';
import type { SourceManga } from '@plugins/types/manga';
import type { DisplayMangaChapter, MangaScreenProps } from '@navigators/types';
import type { ThemeColors } from '@theme/types';
import type { MaterialDesignIconName } from '@type/icon';

/**
 * Manga's `NovelScreen.tsx` mirror — plain `useState`/`useEffect`, not the
 * novel reader's Zustand store (that store serves reader prefetching manga
 * doesn't have). Metadata follows `switchNovelToLibraryQuery`'s "not in DB
 * until added" model; reading itself never requires adding first.
 *
 * Layout tracks Mihon's series screen: a darkened cover backdrop behind a
 * cover + title header, an always-visible three-slot action row
 * (library / tracking / web view), a chevron-collapsible synopsis, a
 * horizontally-scrolling genre-chip row, a resume button, then the chapter
 * list with an inline name filter + a sort toggle. Reader-mode selection
 * lives in the reader itself, not here.
 */
const MangaScreen = ({ route, navigation }: MangaScreenProps) => {
  const theme = useTheme();
  const { hideBackdrop } = useAppSettings();
  const insets = useSafeAreaInsets();
  const params = route.params;
  const isDbRow = 'id' in params;
  const pluginId = params.pluginId;
  const path = params.path;

  const [dbManga, setDbManga] = useState<MangaRow | undefined>(
    isDbRow ? (params as MangaRow) : getMangaByPath(path, pluginId),
  );
  const [sourceManga, setSourceManga] = useState<SourceManga>();
  const [isLoading, setIsLoading] = useState(!dbManga);
  const [error, setError] = useState<string>();
  const [chapters, setChapters] = useState<DisplayMangaChapter[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [chapterFilter, setChapterFilter] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const trackSheetRef = useRef<BottomSheetModalMethods | null>(null);
  const pendingTrackRef = useRef(false);

  const plugin = getMangaPlugin(pluginId);
  const sourceName = plugin?.name ?? pluginId;

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

  const webUrl = useMemo(() => {
    if (isUrlAbsolute(path)) return path;
    const site = plugin?.site;
    if (site && isUrlAbsolute(site)) {
      return `${site.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    }
    return undefined;
  }, [path, plugin?.site]);

  const toggleLibrary = useCallback(async () => {
    setBusy(true);
    try {
      await switchMangaToLibraryQuery(path, pluginId);
      await load();
    } finally {
      setBusy(false);
    }
  }, [path, pluginId, load]);

  useEffect(() => {
    if (dbManga && pendingTrackRef.current) {
      pendingTrackRef.current = false;
      trackSheetRef.current?.present();
    }
  }, [dbManga]);

  const openTracking = useCallback(async () => {
    if (dbManga) {
      trackSheetRef.current?.present();
      return;
    }
    pendingTrackRef.current = true;
    await toggleLibrary();
  }, [dbManga, toggleLibrary]);

  const openWebView = useCallback(() => {
    if (!webUrl || !displayed) return;
    navigation.navigate('WebviewScreen', {
      name: displayed.name,
      url: webUrl,
      pluginId,
    });
  }, [webUrl, displayed, pluginId, navigation]);

  const onShare = useCallback(() => {
    if (!displayed) return;
    Share.share({
      message: webUrl ? `${displayed.name}\n${webUrl}` : displayed.name,
    });
  }, [displayed, webUrl]);

  const refresh = useCallback(async () => {
    setMenuVisible(false);
    if (!dbManga) {
      await load();
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetchManga(pluginId, path);
      await insertMangaChapters(dbManga.id, res.chapters);
      const rows = await getMangaChaptersFromDb(dbManga.id);
      setChapters(rows);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [dbManga, pluginId, path, load]);

  const openChapter = useCallback(
    (index: number) => {
      if (index < 0) return;
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

  const visibleChapters = useMemo(() => {
    const ordered = sortDesc ? [...chapters].reverse() : chapters;
    const q = chapterFilter.trim().toLowerCase();
    return q ? ordered.filter(c => c.name.toLowerCase().includes(q)) : ordered;
  }, [chapters, sortDesc, chapterFilter]);

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
      <View style={[styles.flex1, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={styles.centerLoading} />
      </View>
    );
  }

  if (!displayed) {
    return (
      <View style={[styles.flex1, { backgroundColor: theme.background }]}>
        <EmptyView
          description={error ?? 'Could not load this manga.'}
          theme={theme}
        />
      </View>
    );
  }

  const inLibrary = Boolean(dbManga?.inLibrary);

  const header = (
    <View style={{ paddingTop: insets.top }}>
      <View style={styles.topBar}>
        <IconButton
          icon="arrow-left"
          iconColor={theme.onSurface}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
        />
        <View style={styles.flex1} />
        <IconButton
          icon="share-variant"
          iconColor={theme.onSurface}
          onPress={onShare}
        />
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor={theme.onSurface}
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item onPress={refresh} title="Refresh" leadingIcon="refresh" />
          {webUrl ? (
            <Menu.Item
              onPress={() => {
                setMenuVisible(false);
                openWebView();
              }}
              title="Open in browser"
              leadingIcon="earth"
            />
          ) : null}
        </Menu>
      </View>

      <View style={styles.headerRow}>
        <NovelCoverImage
          uri={displayed.cover}
          requestInit={plugin?.imageRequestInit}
          theme={theme}
          style={styles.cover}
        />
        <View style={styles.headerDetails}>
          <Text
            numberOfLines={3}
            style={[styles.title, { color: theme.onSurface }]}
          >
            {displayed.name}
          </Text>
          {displayed.author ? (
            <Text style={{ color: theme.onSurfaceVariant }}>
              {displayed.author}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Icon
              name="clock-outline"
              size={14}
              color={theme.onSurfaceVariant}
            />
            <Text
              numberOfLines={1}
              style={[styles.metaText, { color: theme.onSurfaceVariant }]}
            >
              {(displayed.status || 'Unknown') + ' • ' + sourceName}
            </Text>
          </View>
          {webUrl ? (
            <Text
              numberOfLines={1}
              style={[styles.urlText, { color: theme.onSurfaceVariant }]}
            >
              {webUrl}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.flex1, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {hideBackdrop || !displayed.cover ? (
          header
        ) : (
          <ImageBackground
            source={{
              uri: displayed.cover,
              headers: plugin?.imageRequestInit?.headers as
                | Record<string, string>
                | undefined,
            }}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={styles.backdrop}
          >
            <View
              style={[
                styles.flex1,
                {
                  backgroundColor: color(theme.background).alpha(0.82).string(),
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(0,0,0,0)', theme.background]}
                locations={[0, 1]}
              >
                {header}
              </LinearGradient>
            </View>
          </ImageBackground>
        )}

        <View style={styles.body}>
          <View style={styles.actionRow}>
            <ActionButton
              icon={inLibrary ? 'heart' : 'heart-outline'}
              label={inLibrary ? 'In Library' : 'Add to Library'}
              active={inLibrary}
              loading={busy}
              theme={theme}
              onPress={toggleLibrary}
            />
            <ActionButton
              icon="sync"
              label="Tracking"
              theme={theme}
              onPress={openTracking}
            />
            <ActionButton
              icon="earth"
              label="Web View"
              disabled={!webUrl}
              theme={theme}
              onPress={openWebView}
            />
          </View>

          {displayed.summary ? (
            <Pressable
              style={styles.summaryBlock}
              onPress={() => setSummaryExpanded(v => !v)}
            >
              <Text
                numberOfLines={summaryExpanded ? undefined : 3}
                style={[styles.summary, { color: theme.onSurface }]}
              >
                {displayed.summary}
              </Text>
              <Icon
                name={summaryExpanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={theme.onSurfaceVariant}
                style={styles.summaryChevron}
              />
            </Pressable>
          ) : null}

          {genreList.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.genreRow}
            >
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
            </ScrollView>
          ) : null}

          {chapters.length > 0 ? (
            <Button
              mode="contained"
              icon="play"
              onPress={() => openChapter(resumeIndex)}
              style={styles.resumeButton}
            >
              {hasProgress ? 'Continue' : 'Start reading'}
            </Button>
          ) : null}

          <View style={styles.chapterHeader}>
            <Text
              style={[styles.sectionHeading, { color: theme.onSurfaceVariant }]}
            >
              {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
            </Text>
            <View style={styles.chapterHeaderActions}>
              {refreshing ? (
                <ActivityIndicator
                  size={18}
                  color={theme.onSurfaceVariant}
                  style={styles.headerIcon}
                />
              ) : null}
              <Pressable
                onPress={() => {
                  setFilterVisible(v => !v);
                  if (filterVisible) setChapterFilter('');
                }}
                hitSlop={8}
                style={styles.headerIcon}
              >
                <Icon
                  name="magnify"
                  size={20}
                  color={filterVisible ? theme.primary : theme.onSurfaceVariant}
                />
              </Pressable>
              <Pressable
                onPress={() => setSortDesc(v => !v)}
                hitSlop={8}
                style={styles.headerIcon}
              >
                <Icon
                  name={sortDesc ? 'sort-descending' : 'sort-ascending'}
                  size={20}
                  color={theme.onSurfaceVariant}
                />
              </Pressable>
            </View>
          </View>

          {filterVisible ? (
            <TextInput
              value={chapterFilter}
              onChangeText={setChapterFilter}
              placeholder="Filter chapters"
              placeholderTextColor={theme.onSurfaceVariant}
              style={[
                styles.filterInput,
                {
                  color: theme.onSurface,
                  borderColor: theme.outline,
                  backgroundColor: theme.surface,
                },
              ]}
            />
          ) : null}

          {visibleChapters.map(chapter => (
            <MangaChapterRow
              key={String(chapter.id)}
              chapter={chapter}
              theme={theme}
              onPress={() => openChapter(chapters.indexOf(chapter))}
            />
          ))}
        </View>
      </ScrollView>

      {dbManga ? (
        <MangaTrackSheet
          bottomSheetRef={trackSheetRef}
          mangaId={dbManga.id}
          mangaName={dbManga.name}
        />
      ) : null}
    </View>
  );
};

const ActionButton = ({
  icon,
  label,
  active,
  loading,
  disabled,
  theme,
  onPress,
}: {
  icon: MaterialDesignIconName;
  label: string;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  theme: ThemeColors;
  onPress: () => void;
}) => {
  const tint = disabled
    ? theme.onSurfaceDisabled
    : active
    ? theme.primary
    : theme.onSurfaceVariant;
  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor, borderless: true }}
      style={styles.actionButton}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator size={22} color={tint} />
      ) : (
        <Icon name={icon} size={22} color={tint} />
      )}
      <Text numberOfLines={1} style={[styles.actionLabel, { color: tint }]}>
        {label}
      </Text>
    </Pressable>
  );
};

export default MangaScreen;

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', flex: 1, gap: 4, paddingVertical: 8 },
  actionLabel: { fontSize: 11 },
  actionRow: { flexDirection: 'row', marginTop: 4 },
  backdrop: { width: '100%' },
  body: { paddingHorizontal: 16 },
  centerLoading: { flex: 1, justifyContent: 'center' },
  chapterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chapterHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  content: { paddingBottom: 48 },
  cover: { borderRadius: 6, height: 160, width: 110 },
  filterInput: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flex1: { flex: 1 },
  genreChip: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 12,
    marginRight: 6,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  genreRow: { paddingVertical: 12 },
  headerDetails: { flex: 1, marginStart: 16 },
  headerIcon: { padding: 4 },
  headerRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 4 },
  metaText: { flex: 1, fontSize: 12 },
  resumeButton: { marginTop: 8 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  summary: { fontSize: 13, lineHeight: 19 },
  summaryBlock: { marginTop: 16 },
  summaryChevron: { alignSelf: 'center', marginTop: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  topBar: { flexDirection: 'row' },
  urlText: { fontSize: 11, marginTop: 4 },
});
