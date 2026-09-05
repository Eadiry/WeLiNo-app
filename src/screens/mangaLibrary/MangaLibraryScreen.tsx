import { useCallback, useMemo } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  useWindowDimensions,
} from 'react-native';
import { FAB } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyView, SafeAreaView, SearchbarV2 } from '@components';
import MangaCover from '@components/MangaCover';
import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { useLiveQuery } from '@database/manager/liveQuery';
import {
  getMangaLibraryQuery,
  switchMangaToLibraryQuery,
} from '@database/queries/MangaQueries';
import type { MangaRow } from '@database/schema';
import type { MangaLibraryScreenProps } from '@navigators/types';

const NUM_COLUMNS = 2;
const COVER_MARGIN = 4;
const EMPTY_LIBRARY: MangaRow[] = [];

/**
 * Manga's `LibraryScreen.tsx` mirror — deliberately a single flat grid for
 * v1, not per-category tabs: `Manga.inLibrary` is a plain boolean (see
 * `MangaQueries.ts`), so there's no category join to group by yet. No
 * selection mode, sort/filter sheet, or downloaded-only/incognito banners
 * either — this phase's job is proving a manga can be browsed into, added,
 * and shows back up here; that parity can follow once there's a reason to
 * need it (multiple manga categories, bulk actions, etc.).
 */
const MangaLibraryScreen = ({ navigation }: MangaLibraryScreenProps) => {
  const theme = useTheme();
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const { width } = useWindowDimensions();
  const { right } = useSafeAreaInsets();

  const library =
    useLiveQuery(getMangaLibraryQuery(), [{ table: 'Manga' }]) ?? EMPTY_LIBRARY;

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return library;
    return library.filter(m => m.name.toLowerCase().includes(query));
  }, [library, searchText]);

  const coverWidth = width / NUM_COLUMNS - COVER_MARGIN * 2;
  const coverHeight = coverWidth * 1.4;

  const openManga = useCallback(
    (manga: MangaRow) => navigation.navigate('MangaScreen', manga),
    [navigation],
  );

  const removeFromLibrary = useCallback((manga: MangaRow) => {
    switchMangaToLibraryQuery(manga.path, manga.pluginId);
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MangaRow>) => (
      <MangaCover
        item={item}
        theme={theme}
        width={coverWidth}
        height={coverHeight}
        libraryStatus
        onPress={() => openManga(item)}
        onLongPress={removeFromLibrary}
      />
    ),
    [theme, coverWidth, coverHeight, openManga, removeFromLibrary],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        placeholder={getString('libraryScreen.searchbar')}
        leftIcon="magnify"
        onChangeText={setSearchText}
        clearSearchbar={clearSearchbar}
        theme={theme}
      />
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        numColumns={NUM_COLUMNS}
        renderItem={renderItem}
        contentContainerStyle={{ padding: COVER_MARGIN, paddingBottom: 120 }}
        ListEmptyComponent={
          <EmptyView
            icon="(￣ε￣;)"
            description="Add manga to your library from Browse."
            theme={theme}
            actions={[
              {
                iconName: 'compass-outline',
                title: getString('browse'),
                onPress: () => navigation.navigate('Manga'),
              },
            ]}
          />
        }
      />
      <FAB
        style={{ margin: 16, position: 'absolute', bottom: 0, end: right }}
        color={theme.onPrimary}
        customSize={48}
        icon="compass-outline"
        onPress={() => navigation.navigate('MangaBrowseScreen')}
      />
    </SafeAreaView>
  );
};

export default MangaLibraryScreen;
