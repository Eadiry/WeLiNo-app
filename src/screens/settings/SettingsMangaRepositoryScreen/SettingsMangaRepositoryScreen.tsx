import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
  Appbar,
  EmptyView,
  IconButtonV2,
  SafeAreaView,
  SegmentedControl,
} from '@components';
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
import {
  fetchMangaPlugins,
  installTemplateMangaPlugin,
} from '@plugins/mangaPluginManager';
import { detectSiteTemplate } from '@plugins/templates';
import { KNOWN_PAPERBACK_REPOSITORIES } from '@plugins/knownPaperbackRepositories';
import type { MangaRepositorySettingsScreenProps } from '@navigators/types';

const REPO_URL_RE = /^https?:\/\/.+/i;
type AddMode = 'repository' | 'site';
const EMPTY_REPOSITORIES: MangaRepositoryRow[] = [];

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
    ]) ?? EMPTY_REPOSITORIES;

  const {
    value: addVisible,
    setTrue: showAdd,
    setFalse: hideAdd,
  } = useBoolean();
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<MangaRepositoryRow['format']>('native');
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [addMode, setAddMode] = useState<AddMode>('repository');
  const [siteUrl, setSiteUrl] = useState('');
  const {
    value: detecting,
    setTrue: startDetecting,
    setFalse: stopDetecting,
  } = useBoolean();

  const suggestedRepositories = useMemo(() => {
    const addedUrls = new Set(repositories.map(r => r.url));
    return KNOWN_PAPERBACK_REPOSITORIES.filter(r => !addedUrls.has(r.url));
  }, [repositories]);

  const refreshSourceCount = useCallback(async () => {
    const plugins = await fetchMangaPlugins();
    setSourceCount(plugins.length);
  }, []);

  useEffect(() => {
    refreshSourceCount();
  }, [refreshSourceCount, repositories.length]);

  const addRepository = useCallback(
    async (repoUrl: string, repoFormat: MangaRepositoryRow['format']) => {
      const trimmed = repoUrl.trim();
      if (!REPO_URL_RE.test(trimmed)) {
        showToast('Enter a valid repository URL');
        return;
      }
      if (await isMangaRepoUrlDuplicated(trimmed)) {
        showToast('That repository is already added');
        return;
      }
      await createMangaRepository(trimmed, repoFormat);
      setUrl('');
      setFormat('native');
      hideAdd();
      refreshSourceCount();
    },
    [hideAdd, refreshSourceCount],
  );

  const addSuggestedRepository = useCallback(
    (repoUrl: string) => addRepository(repoUrl, 'paperback'),
    [addRepository],
  );

  /**
   * "Single site" mode: no repository, no bundle — fetches the pasted URL
   * once, checks it against known CMS/theme fingerprints (`@plugins/templates`,
   * Madara today), and installs a generated plugin directly on a match.
   * There's no universal fallback by design: a non-match means auto-detection
   * genuinely doesn't recognize this site's software, not a bug to retry.
   */
  const addSingleSite = useCallback(
    async (siteUrlInput: string) => {
      const trimmed = siteUrlInput.trim();
      if (!REPO_URL_RE.test(trimmed)) {
        showToast('Enter a valid site URL');
        return;
      }
      startDetecting();
      try {
        const match = await detectSiteTemplate(trimmed);
        if (!match) {
          showToast(
            "Couldn't recognize this site's software — it may need a Paperback repository, or a hand-written plugin.",
          );
          return;
        }
        const plugin = installTemplateMangaPlugin(
          match.template.id,
          match.config,
        );
        if (!plugin) {
          showToast('Something went wrong installing this source.');
          return;
        }
        showToast(`Added ${plugin.name} (${match.template.name})`);
        setSiteUrl('');
        hideAdd();
        refreshSourceCount();
      } catch {
        showToast("Couldn't reach that site — check the URL and try again.");
      } finally {
        stopDetecting();
      }
    },
    [hideAdd, refreshSourceCount, startDetecting, stopDetecting],
  );

  useEffect(() => {
    if (params?.url) {
      addRepository(params.url, 'native');
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
          <View>
            {sourceCount != null && repositories.length > 0 ? (
              <Text
                style={[styles.sourceCount, { color: theme.onSurfaceVariant }]}
              >
                {sourceCount} manga source{sourceCount === 1 ? '' : 's'}{' '}
                available
              </Text>
            ) : null}
            {suggestedRepositories.length > 0 ? (
              <View style={styles.suggestedSection}>
                <Text
                  style={[
                    styles.suggestedHeading,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  Suggested repositories
                </Text>
                {suggestedRepositories.map(suggestion => (
                  <View
                    key={suggestion.url}
                    style={[
                      styles.repoRow,
                      { backgroundColor: theme.surfaceVariant },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.repoUrl, { color: theme.onSurface }]}
                    >
                      {suggestion.name}
                    </Text>
                    <Button
                      onPress={() => addSuggestedRepository(suggestion.url)}
                    >
                      Add
                    </Button>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
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
        <Dialog
          visible={addVisible}
          onDismiss={() => {
            hideAdd();
            setAddMode('repository');
            setSiteUrl('');
          }}
        >
          <Dialog.Title>Add manga source</Dialog.Title>
          <Dialog.Content>
            <SegmentedControl<AddMode>
              options={[
                { value: 'repository', label: 'Repository' },
                { value: 'site', label: 'Single site' },
              ]}
              value={addMode}
              onChange={setAddMode}
              theme={theme}
            />
            <View style={styles.formatGap} />
            {addMode === 'repository' ? (
              <>
                <TextInput
                  autoFocus
                  mode="outlined"
                  placeholder="https://…/index.json"
                  value={url}
                  onChangeText={text => {
                    setUrl(text);
                    // Best-effort default: Paperback/Inkdex catalogs are
                    // always published as a `versioning.json` registry.
                    setFormat(
                      text.trim().endsWith('versioning.json')
                        ? 'paperback'
                        : 'native',
                    );
                  }}
                />
                <View style={styles.formatGap} />
                <SegmentedControl<'native' | 'paperback'>
                  options={[
                    { value: 'native', label: 'LNReader-style' },
                    { value: 'paperback', label: 'Paperback/Inkdex' },
                  ]}
                  value={format}
                  onChange={setFormat}
                  theme={theme}
                />
                <Text
                  style={[styles.formatHint, { color: theme.onSurfaceVariant }]}
                >
                  {format === 'paperback'
                    ? 'A compiled Paperback/Inkdex extension catalog (a versioning.json URL).'
                    : "This app's own plugin format — a JSON list of sources."}
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  autoFocus
                  mode="outlined"
                  placeholder="https://example.com"
                  value={siteUrl}
                  onChangeText={setSiteUrl}
                  disabled={detecting}
                />
                <Text
                  style={[styles.formatHint, { color: theme.onSurfaceVariant }]}
                >
                  {detecting
                    ? 'Checking this site…'
                    : "Paste a manga site's URL — if it's built on a CMS we recognize (Madara, so far), a source is generated automatically. No universal support: an unrecognized site needs a repository or a hand-written plugin instead."}
                </Text>
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                hideAdd();
                setAddMode('repository');
                setSiteUrl('');
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={detecting}
              onPress={() =>
                addMode === 'repository'
                  ? addRepository(url, format)
                  : addSingleSite(siteUrl)
              }
            >
              Add
            </Button>
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
  formatGap: { height: 12 },
  formatHint: { fontSize: 12, marginTop: 8 },
  suggestedSection: { marginBottom: 16 },
  suggestedHeading: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
});
