import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  type ImageStyle,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TabView, type TabBarProps } from 'react-native-tab-view';

import {
  ConfirmationDialog,
  EmptyView,
  IconButtonV2,
  SafeAreaView,
  TopTabBar,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { getLocaleLanguageName } from '@utils/constants/languages';
import { showToast } from '@utils/showToast';
import {
  fetchMangaPlugins,
  getInstalledMangaPlugins,
  installMangaPlugin,
  uninstallMangaPlugin,
  type MangaPluginItem,
} from '@plugins/mangaPluginManager';
import type { MangaPlugin } from '@plugins/types/manga';
import type { MangaBrowseScreenProps } from '@navigators/types';
import type { ThemeColors } from '@theme/types';

/**
 * `fetchPaperbackRepositoryPlugins` builds every icon URL assuming the
 * current (0.9) repo layout — `<id>/static/<icon>` — confirmed correct for
 * the main Inkdex registry. The older v1/0.8 repos it now also supports
 * (`paperbackLegacyAdapter.ts`) serve icons one path segment over instead —
 * `<id>/includes/<icon>` — confirmed against real NMN's/GameFuzzy's/
 * Netsky's repos. Which convention a given repo uses isn't knowable from
 * `versioning.json` alone (that's the same "discover the format from the
 * actual bundle content" situation `loadPaperbackPlugin` is already in), so
 * fall back client-side on a load failure rather than guess ahead of time.
 */
const withIncludesIconFallback = (uri: string) =>
  uri.includes('/static/') ? uri.replace('/static/', '/includes/') : undefined;

const PluginIcon = ({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ImageStyle>;
}) => {
  const [source, setSource] = useState(uri);
  useEffect(() => setSource(uri), [uri]);
  return (
    <Image
      source={{ uri: source }}
      style={style}
      onError={() => {
        const fallback = withIncludesIconFallback(uri);
        if (fallback && fallback !== source) {
          setSource(fallback);
        }
      }}
    />
  );
};

type BrowseRoute = { key: 'sources' | 'plugins'; title: string };
const routes: BrowseRoute[] = [
  { key: 'sources', title: 'Sources' },
  { key: 'plugins', title: 'Plugins' },
];

/**
 * Manga's `BrowseScreen.tsx` mirror — same Sources/Plugins two-tab shell,
 * much simpler contents: no pinning, discover cards, or LegendList
 * entry-building utilities (`buildBrowseEntries.ts`'s manga equivalent isn't
 * worth building until there's a reason to — a plain list covers a catalog
 * this small). Installed-plugin state is read straight off
 * `mangaPluginManager` on focus rather than through a persisted store, same
 * as `SettingsMangaRepositoryScreen` already does.
 */
const MangaBrowseScreen = ({ navigation }: MangaBrowseScreenProps) => {
  const theme = useTheme();
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [installed, setInstalled] = useState<MangaPlugin[]>([]);

  useFocusEffect(
    useCallback(() => {
      setInstalled(getInstalledMangaPlugins());
    }, []),
  );

  const openPlugins = useCallback(() => setIndex(1), []);

  const openSource = useCallback(
    (plugin: MangaPlugin) =>
      navigation.navigate('MangaSourceScreen', {
        pluginId: plugin.id,
        pluginName: plugin.name,
      }),
    [navigation],
  );

  const refreshInstalled = useCallback(
    () => setInstalled(getInstalledMangaPlugins()),
    [],
  );

  const renderScene = useCallback(
    ({ route }: { route: BrowseRoute }) =>
      route.key === 'plugins' ? (
        <PluginsTab theme={theme} onInstalled={refreshInstalled} />
      ) : (
        <SourcesTab
          theme={theme}
          plugins={installed}
          onPress={openSource}
          onOpenPlugins={openPlugins}
        />
      ),
    [theme, installed, openSource, openPlugins, refreshInstalled],
  );

  const renderTabBar = useCallback(
    (props: TabBarProps<BrowseRoute>) => (
      <TopTabBar
        {...props}
        indicatorStyle={{ backgroundColor: theme.primary, height: 3 }}
        style={{ backgroundColor: theme.surface }}
        inactiveColor={theme.secondary}
        activeColor={theme.primary}
      />
    ),
    [theme],
  );

  return (
    <SafeAreaView excludeBottom>
      <View style={styles.header}>
        <IconButtonV2
          name="arrow-left"
          color={theme.onSurface}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          theme={theme}
        />
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>
          Browse manga
        </Text>
      </View>
      <TabView<BrowseRoute>
        navigationState={{ index, routes }}
        initialLayout={{ width: layout.width }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        renderTabBar={renderTabBar}
        lazy
      />
    </SafeAreaView>
  );
};

export default MangaBrowseScreen;

const SourcesTab = ({
  theme,
  plugins,
  onPress,
  onOpenPlugins,
}: {
  theme: ThemeColors;
  plugins: MangaPlugin[];
  onPress: (plugin: MangaPlugin) => void;
  onOpenPlugins: () => void;
}) => (
  <FlatList
    data={plugins}
    keyExtractor={item => item.id}
    ListEmptyComponent={
      <EmptyView
        description="No manga sources installed yet."
        theme={theme}
        actions={[
          {
            iconName: 'puzzle-outline',
            title: 'Plugins',
            onPress: onOpenPlugins,
          },
        ]}
      />
    }
    renderItem={({ item }) => (
      <Pressable
        style={styles.row}
        android_ripple={{ color: theme.rippleColor }}
        onPress={() => onPress(item)}
      >
        <PluginIcon
          uri={item.iconUrl}
          style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
        />
        <View style={styles.details}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: theme.onSurface }]}
          >
            {item.name}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.description, { color: theme.onSurfaceVariant }]}
          >
            {getLocaleLanguageName(item.lang)}
          </Text>
        </View>
      </Pressable>
    )}
  />
);

const PluginsTab = ({
  theme,
  onInstalled,
}: {
  theme: ThemeColors;
  onInstalled: () => void;
}) => {
  const [available, setAvailable] = useState<MangaPluginItem[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(
    () => new Set(getInstalledMangaPlugins().map(p => p.id)),
  );
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [pendingUninstall, setPendingUninstall] = useState<MangaPluginItem>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAvailable(await fetchMangaPlugins());
      setInstalledIds(new Set(getInstalledMangaPlugins().map(p => p.id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const install = useCallback(
    async (plugin: MangaPluginItem) => {
      setPendingIds(prev => new Set(prev).add(plugin.id));
      try {
        const installedPlugin = await installMangaPlugin(plugin);
        if (installedPlugin) {
          showToast(`Installed ${installedPlugin.name}`);
          setInstalledIds(new Set(getInstalledMangaPlugins().map(p => p.id)));
          onInstalled();
        } else {
          showToast(`Could not install ${plugin.name}`);
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingIds(prev => {
          const next = new Set(prev);
          next.delete(plugin.id);
          return next;
        });
      }
    },
    [onInstalled],
  );

  const uninstall = useCallback(
    async (plugin: MangaPluginItem) => {
      await uninstallMangaPlugin(plugin);
      showToast(`Uninstalled ${plugin.name}`);
      setInstalledIds(new Set(getInstalledMangaPlugins().map(p => p.id)));
      onInstalled();
    },
    [onInstalled],
  );

  return (
    <>
      <FlatList
        data={available}
        keyExtractor={item => item.id}
        refreshing={loading}
        onRefresh={refresh}
        ListEmptyComponent={
          !loading ? (
            <EmptyView
              description={getString('browseScreen.noPlugins')}
              theme={theme}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const isInstalled = installedIds.has(item.id);
          const isPending = pendingIds.has(item.id);
          return (
            <View style={styles.row}>
              <PluginIcon
                uri={item.iconUrl}
                style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
              />
              <View style={styles.details}>
                <Text
                  numberOfLines={1}
                  style={[styles.name, { color: theme.onSurface }]}
                >
                  {item.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.description,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {getLocaleLanguageName(item.lang)} · {item.version}
                </Text>
              </View>
              {isInstalled ? (
                <IconButtonV2
                  name="check"
                  color={theme.primary}
                  theme={theme}
                  onPress={() => setPendingUninstall(item)}
                />
              ) : (
                <IconButtonV2
                  name="download-outline"
                  color={theme.onSurface}
                  disabled={isPending}
                  theme={theme}
                  onPress={() => install(item)}
                />
              )}
            </View>
          );
        }}
      />
      <ConfirmationDialog
        title="Uninstall plugin"
        message={
          pendingUninstall
            ? `Remove ${pendingUninstall.name}? Its installed source will no longer be available.`
            : undefined
        }
        visible={!!pendingUninstall}
        confirmLabel="Uninstall"
        onDismiss={() => setPendingUninstall(undefined)}
        onConfirm={() => pendingUninstall && uninstall(pendingUninstall)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  description: { fontSize: 12 },
  details: { flex: 1, marginStart: 16 },
  header: { alignItems: 'center', flexDirection: 'row', paddingEnd: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  icon: { borderRadius: 4, height: 44, width: 44 },
  name: { fontSize: 14 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
