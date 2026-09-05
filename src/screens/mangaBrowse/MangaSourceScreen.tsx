import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import Icon from '@react-native-vector-icons/material-design-icons';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

import {
  EmptyView,
  ErrorScreenV2,
  SafeAreaView,
  SearchbarV2,
} from '@components';
import MangaCover from '@components/MangaCover';
import FilterBottomSheet from '@screens/BrowseSourceScreen/components/FilterBottomSheet';
import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';

import { getMangaPlugin } from '@plugins/mangaPluginManager';
import type { MangaSourceItem } from '@plugins/types/manga';
import type { Filters, FilterToValues } from '@plugins/types/filterTypes';
import {
  getMangaLibraryQuery,
  switchMangaToLibraryQuery,
} from '@database/queries/MangaQueries';
import { useLiveQuery } from '@database/manager/liveQuery';
import type { MangaSourceScreenProps } from '@navigators/types';

const NUM_COLUMNS = 2;
const COVER_MARGIN = 4;

/**
 * Manga's `BrowseSourceScreen.tsx` mirror — popular + search for one
 * installed plugin, trimmed for v1: no webview escape hatch. Pagination is
 * simpler than `useBrowseSource.ts`'s queued/generation-tracked version —
 * a manga catalog this size doesn't need that hardening yet; revisit if a
 * real source proves flaky. Filters reuse `FilterBottomSheet`/`Filters`
 * verbatim from the novel side (already content-type-agnostic) rather than
 * a forked copy — see `paperbackAdapter.ts`'s `getSearchTags`-based genre
 * filter for where `plugin.filters` actually comes from.
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
  const [latest, setLatest] = useState(false);
  const inFlightRef = useRef(false);
  const filterSheetRef = useRef<BottomSheetModalMethods | null>(null);

  // `plugin.filters` is populated asynchronously (a real source's
  // `getSearchTags()` is a network call — see `paperbackAdapter.ts`), so
  // this can't just be read once at mount; refreshed from `plugin.filters`
  // after every fetch below, same as the novel side's `useBrowseSource`.
  const [filterValues, setFilterValues] = useState<Filters | undefined>(
    plugin?.filters,
  );
  const [selectedFilters, setSelectedFilters] = useState<
    FilterToValues<Filters> | undefined
  >(filterValues);

  const library =
    useLiveQuery(getMangaLibraryQuery(), [{ table: 'Manga' }]) ?? [];
  const libraryPaths = new Set(library.map(m => m.path));

  const load = useCallback(
    async (
      pageNo: number,
      term: string,
      filters?: FilterToValues<Filters>,
      showLatest?: boolean,
    ) => {
      if (!plugin || inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);
      setError(undefined);
      try {
        const res = term
          ? await plugin.searchManga(term, pageNo)
          : await plugin.popularManga(pageNo, {
              filters,
              showLatestManga: showLatest,
            });
        setItems(prev => (pageNo === 1 ? res : [...prev, ...res]));
        setHasNextPage(res.length > 0);
        setFilterValues(plugin.filters);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
        inFlightRef.current = false;
      }
    },
    [plugin],
  );

  const reload = useCallback(
    (showLatest: boolean, filters?: FilterToValues<Filters>) => {
      setPage(1);
      setItems([]);
      setHasNextPage(true);
      load(1, searchText.trim(), filters ?? selectedFilters, showLatest);
    },
    [load, searchText, selectedFilters],
  );

  useEffect(() => {
    reload(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, latest]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasNextPage) return;
    const next = page + 1;
    setPage(next);
    load(next, searchText.trim(), selectedFilters, latest);
  }, [isLoading, hasNextPage, page, load, searchText, selectedFilters, latest]);

  const setFilters = useCallback(
    (filters?: FilterToValues<Filters>) => {
      setSelectedFilters(filters);
      reload(latest, filters);
    },
    [reload, latest],
  );

  // Matches the novel side's `useBrowseSource.clearFilters`: resets the
  // selected-filters state without refetching — the sheet's own Reset
  // button doesn't close/apply, only its separate "Filter" button does.
  const clearFilters = useCallback(
    (filters: Filters) => setSelectedFilters(filters),
    [],
  );

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
      {!searchText ? (
        <View style={styles.pillRow}>
          <Pill
            label="Popular"
            icon="heart-outline"
            active={!latest}
            theme={theme}
            onPress={() => setLatest(false)}
          />
          <Pill
            label="Latest"
            icon="clock-outline"
            active={latest}
            theme={theme}
            onPress={() => setLatest(true)}
          />
          {filterValues ? (
            <Pill
              label="Filter"
              icon="filter-variant"
              theme={theme}
              onPress={() => filterSheetRef?.current?.present()}
            />
          ) : null}
        </View>
      ) : null}
      {!plugin ? (
        <ErrorScreenV2 error={`Plugin ${pluginId} is not loaded.`} />
      ) : error && items.length === 0 ? (
        <ErrorScreenV2
          error={error}
          actions={[
            {
              iconName: 'refresh',
              title: 'Retry',
              onPress: () => reload(latest),
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
      {filterValues && !searchText ? (
        <FilterBottomSheet
          filterSheetRef={filterSheetRef}
          filters={filterValues}
          setFilters={setFilters}
          clearFilters={clearFilters}
        />
      ) : null}
    </SafeAreaView>
  );
};

const Pill = ({
  label,
  icon,
  active,
  theme,
  onPress,
}: {
  label: string;
  icon: string;
  active?: boolean;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    android_ripple={{ color: theme.rippleColor }}
    style={[
      styles.pill,
      {
        borderColor: active ? theme.primary : theme.outline,
        backgroundColor: active ? theme.primaryContainer : 'transparent',
      },
    ]}
  >
    <Icon
      name={icon as never}
      size={16}
      color={active ? theme.primary : theme.onSurfaceVariant}
    />
    <Text
      style={[
        styles.pillLabel,
        { color: active ? theme.primary : theme.onSurfaceVariant },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

export default MangaSourceScreen;

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillLabel: { fontSize: 13, fontWeight: '600' },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
});
