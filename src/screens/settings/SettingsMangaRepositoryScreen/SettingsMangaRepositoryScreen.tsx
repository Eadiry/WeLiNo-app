import { useCallback, useEffect, useState } from 'react';
import { FlatList, ListRenderItemInfo, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  FAB,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appbar, EmptyView, IconButtonV2, SafeAreaView } from '@components';
import Switch from '@components/Switch/Switch';
import { useBoolean } from '@hooks/index';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';

import { useLiveQuery } from '@database/manager/liveQuery';
import { dbManager } from '@database/db';
import {
  mangaRepositorySchema,
  type MangaRepositoryRow,
} from '@database/schema';
import {
  createMangaRepository,
  deleteMangaRepositoryById,
  isMangaRepoUrlDuplicated,
  setMangaRepositoryEnabled,
} from '@database/queries/MangaRepositoryQueries';
import { fetchMangaPlugins } from '@plugins/mangaPluginManager';
import type { MangaRepositorySettingsScreenProps } from '@navigators/types';

const REPO_URL_RE = /^https?:\/\/.+/i;

/**
 * Manga's own "Repositories" screen — mirrors
 * SettingsRepositoryScreen.tsx's repo-list CRUD, pointed at the separate
 * MangaRepository table / mangaPluginManager instead of the novel one. No
 * install/browse UI here yet (that's the Manga Browse screen, Phase 2) — this
 * screen's job is just proving a repo URL resolves to a loadable plugin list.
 */
const SettingsMangaRepositoryScreen = ({
  route: { params },
  navigation,
}: MangaRepositorySettingsScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();

  const repositories =
    useLiveQuery(dbManager.select().from(mangaRepositorySchema), [
      { table: 'MangaRepository' },
    ]) ?? [];

  const {
    value: addVisible,
    setTrue: showAdd,
    setFalse: hideAdd,
  } = useBoolean();
  const [url, setUrl] = useState('');
  const [sourceCount, setSourceCount] = useState<number | null>(null);

  const refreshSourceCount = useCallback(async () => {
    const plugins = await fetchMangaPlugins();
    setSourceCount(plugins.length);
  }, []);

  useEffect(() => {
    refreshSourceCount();
  }, [refreshSourceCount, repositories.length]);

  const addRepository = useCallback(
    async (repoUrl: string) => {
      const trimmed = repoUrl.trim();
      if (!REPO_URL_RE.test(trimmed)) {
        showToast('Enter a valid repository URL');
        return;
      }
      if (await isMangaRepoUrlDuplicated(trimmed)) {
        showToast('That repository is already added');
        return;
      }
      await createMangaRepository(trimmed);
      setUrl('');
      hideAdd();
      refreshSourceCount();
    },
    [hideAdd, refreshSourceCount],
  );

  useEffect(() => {
    if (params?.url) {
      addRepository(params.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.url]);

  const renderRepository = useCallback(
    ({ item }: ListRenderItemInfo<MangaRepositoryRow>) => (
      <View
        style={[styles.repoRow, { backgroundColor: theme.secondaryContainer }]}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          style={[styles.repoUrl, { color: theme.onSurface }]}
        >
          {item.url}
        </Text>
        <Switch
          value={item.enabled}
          onValueChange={() =>
            setMangaRepositoryEnabled(item.id, !item.enabled).then(
              refreshSourceCount,
            )
          }
        />
        <IconButtonV2
          name="delete-outline"
          color={theme.onSurface}
          onPress={() =>
            deleteMangaRepositoryById(item.id).then(refreshSourceCount)
          }
          theme={theme}
        />
      </View>
    ),
    [theme, refreshSourceCount],
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title="Manga repositories"
        handleGoBack={() => navigation.canGoBack() && navigation.goBack()}
        theme={theme}
      />

      <FlatList
        data={repositories}
        keyExtractor={item => String(item.id)}
        renderItem={renderRepository}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          sourceCount != null && repositories.length > 0 ? (
            <Text
              style={[styles.sourceCount, { color: theme.onSurfaceVariant }]}
            >
              {sourceCount} manga source{sourceCount === 1 ? '' : 's'} available
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyView
            icon="(￣ε￣;)"
            description="Add a plugin repository URL to browse manga/manhua sources."
            theme={theme}
          />
        }
      />

      <FAB
        style={[styles.fab, { backgroundColor: theme.primary, right, bottom }]}
        color={theme.onPrimary}
        label="Add"
        uppercase={false}
        icon="plus"
        onPress={showAdd}
      />

      <Portal>
        <Dialog visible={addVisible} onDismiss={hideAdd}>
          <Dialog.Title>Add manga repository</Dialog.Title>
          <Dialog.Content>
            <TextInput
              autoFocus
              mode="outlined"
              placeholder="https://…/index.json"
              value={url}
              onChangeText={setUrl}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideAdd}>Cancel</Button>
            <Button onPress={() => addRepository(url)}>Add</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

export default SettingsMangaRepositoryScreen;

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  sourceCount: { fontSize: 13, marginBottom: 8 },
  repoRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  repoUrl: { flex: 1, fontSize: 14 },
  fab: { margin: 16, position: 'absolute', right: 0 },
});
