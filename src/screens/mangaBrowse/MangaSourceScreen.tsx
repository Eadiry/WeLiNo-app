import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  useWindowDimensions,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

import {
  EmptyView,
  ErrorScreenV2,
  SafeAreaView,
  SearchbarV2,
} from '@components';
import MangaCover from '@components/MangaCover';
import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';

import { getMangaPlugin } from '@plugins/mangaPluginManager';
import type { MangaSourceItem } from '@plugins/types/manga';
import {
  getMangaLibraryQuery,
  switchMangaToLibraryQuery,
} from '@database/queries/MangaQueries';
import { useLiveQuery } from '@database/manager/liveQuery';
import type { MangaSourceScreenProps } from '@navigators/types';

const NUM_COLUMNS = 3;
const COVER_MARGIN = 4;

/**
 * Manga's `BrowseSourceScreen.tsx` mirror — popular + search for one
 * installed plugin, trimmed for v1: no filters (Paperback's own filter
 * surface is minimal today, and the Madara template has none yet) and no
 * webview escape hatch. Pagination is simpler than `useBrowseSource.ts`'s
 * queued/generation-tracked version too — a manga catalog this size doesn't
 * need that hardening yet; revisit if a real source proves flaky.
 */
const MangaSourceScreen = ({ route, navigation }: MangaSourceScreenProps) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { pluginId, pluginName } = route.params;
  const plugin = getMangaPlugin(pluginId);

  const [items, setItems] = useState<MangaSourceItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [error, setError] = useState<string>();
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const inFlightRef = useRef(false);

  const library =
    useLiveQuery(getMangaLibraryQuery(), [{ table: 'Manga' }]) ?? [];
  const libraryPaths = new Set(library.map(m => m.path));

  const load = useCallback(
    async (pageNo: number, term: string) => {
      if (!plugin || inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);
      setError(undefined);
      try {
        const res = term
          ? await plugin.searchManga(term, pageNo)
          : await plugin.popularManga(pageNo);
        setItems(prev => (pageNo === 1 ? res : [...prev, ...res]));
        setHasNextPage(res.length > 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
        inFlightRef.current = false;
      }
    },
    [plugin],
  );

  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasNextPage(true);
    load(1, searchText.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasNextPage) return;
    const next = page + 1;
    setPage(next);
    load(next, searchText.trim());
  }, [isLoading, hasNextPage, page, load, searchText]);

  const openManga = useCallback(
    (item: MangaSourceItem) =>
      navigation.navigate('MangaScreen', {
        path: item.path,
        pluginId,
        name: item.name,
        cover: item.cover,
      }),
    [navigation, pluginId],
  );

  const coverWidth = width / NUM_COLUMNS - COVER_MARGIN * 2;
  const coverHeight = coverWidth * 1.4;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MangaSourceItem>) => (
      <MangaCover
        item={item}
        theme={theme}
        width={coverWidth}
        height={coverHeight}
        libraryStatus={libraryPaths.has(item.path)}
        onPress={() => openManga(item)}
        onLongPress={() => switchMangaToLibraryQuery(item.path, pluginId)}
        imageRequestInit={plugin?.imageRequestInit}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, coverWidth, coverHeight, openManga, pluginId, plugin, library],
  );

  return (
    <SafeAreaView>
      <SearchbarV2
        searchText={searchText}
        leftIcon="magnify"
        placeholder={`Search ${pluginName}`}
        onChangeText={setSearchText}
        clearSearchbar={clearSearchbar}
        handleBackAction={navigation.goBack}
        theme={theme}
      />
      {!plugin ? (
        <ErrorScreenV2 error={`Plugin ${pluginId} is not loaded.`} />
      ) : error && items.length === 0 ? (
        <ErrorScreenV2
          error={error}
          actions={[
            {
              iconName: 'refresh',
              title: 'Retry',
              onPress: () => load(1, searchText.trim()),
            },
          ]}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.path}
          numColumns={NUM_COLUMNS}
          renderItem={renderItem}
          contentContainerStyle={{ padding: COVER_MARGIN, paddingBottom: 120 }}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          ListEmptyComponent={
            !isLoading ? (
              <EmptyView description="No results found." theme={theme} />
            ) : null
          }
          ListFooterComponent={
            isLoading ? <ActivityIndicator style={{ margin: 16 }} /> : null
          }
        />
      )}
    </SafeAreaView>
  );
};

export default MangaSourceScreen;
