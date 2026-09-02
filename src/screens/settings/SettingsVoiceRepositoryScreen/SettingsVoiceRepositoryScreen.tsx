import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Dialog,
  FAB,
  Portal,
  ProgressBar,
  TextInput,
} from 'react-native-paper';

import { Appbar, EmptyView, IconButtonV2, SafeAreaView } from '@components';
import Switch from '@components/Switch/Switch';
import { useTheme } from '@hooks/persisted';
import { useBoolean } from '@hooks/index';
import { showToast } from '@utils/showToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLiveQuery } from '@database/manager/liveQuery';
import { dbManager } from '@database/db';
import { voiceRepositorySchema } from '@database/schema';
import {
  createVoiceRepository,
  deleteVoiceRepositoryById,
  isVoiceRepoUrlDuplicated,
  setVoiceRepositoryEnabled,
} from '@database/queries/VoiceRepositoryQueries';
import {
  fetchAllVoiceManifests,
  installEngine,
  isEngineInstalled,
  uninstallEngine,
  type LoadedVoiceManifest,
} from '@services/tts/voiceRepository';
import { VoiceRepositorySettingsScreenProps } from '@navigators/types';

const MANIFEST_URL_RE = /^https?:\/\/.*voices(\.min)?\.json(\?.*)?$/i;

type EngineState = {
  installed: boolean;
  progress?: number;
  busy?: boolean;
};

const SettingsVoiceRepositoryScreen = ({
  route: { params },
  navigation,
}: VoiceRepositorySettingsScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();

  const repositories =
    useLiveQuery(dbManager.select().from(voiceRepositorySchema), [
      { table: 'VoiceRepository' },
    ]) ?? [];

  const {
    value: addVisible,
    setTrue: showAdd,
    setFalse: hideAdd,
  } = useBoolean();
  const [url, setUrl] = useState('');
  const [manifests, setManifests] = useState<LoadedVoiceManifest[]>([]);
  const [engineState, setEngineState] = useState<Record<string, EngineState>>(
    {},
  );

  const refreshManifests = useCallback(async () => {
    const loaded = await fetchAllVoiceManifests();
    setManifests(loaded);
    const next: Record<string, EngineState> = {};
    await Promise.all(
      loaded.map(async ({ manifest }) => {
        next[manifest.engine.id] = {
          installed: await isEngineInstalled(manifest.engine),
        };
      }),
    );
    setEngineState(prev => {
      // Preserve any in-flight progress.
      const merged = { ...next };
      for (const [id, state] of Object.entries(prev)) {
        if (state.busy) merged[id] = state;
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    refreshManifests();
  }, [refreshManifests, repositories.length]);

  const addRepository = useCallback(
    async (repoUrl: string) => {
      const trimmed = repoUrl.trim();
      if (!MANIFEST_URL_RE.test(trimmed)) {
        showToast('Enter a valid voices.json manifest URL');
        return;
      }
      if (await isVoiceRepoUrlDuplicated(trimmed)) {
        showToast('That repository is already added');
        return;
      }
      await createVoiceRepository(trimmed);
      setUrl('');
      hideAdd();
      refreshManifests();
    },
    [hideAdd, refreshManifests],
  );

  useEffect(() => {
    if (params?.url) {
      addRepository(params.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.url]);

  const download = useCallback(async (loaded: LoadedVoiceManifest) => {
    const { engine } = loaded.manifest;
    setEngineState(prev => ({
      ...prev,
      [engine.id]: { installed: false, progress: 0, busy: true },
    }));
    try {
      await installEngine(engine, p =>
        setEngineState(prev => ({
          ...prev,
          [engine.id]: { installed: false, progress: p.fraction, busy: true },
        })),
      );
      setEngineState(prev => ({
        ...prev,
        [engine.id]: { installed: true },
      }));
      showToast(`${engine.name} downloaded`);
    } catch (e) {
      setEngineState(prev => ({
        ...prev,
        [engine.id]: { installed: false },
      }));
      showToast(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const remove = useCallback(async (engineId: string, name: string) => {
    await uninstallEngine(engineId);
    setEngineState(prev => ({ ...prev, [engineId]: { installed: false } }));
    showToast(`${name} removed`);
  }, []);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title="Voice repositories"
        handleGoBack={() => navigation.canGoBack() && navigation.goBack()}
        theme={theme}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.onSurfaceVariant }]}>
          Repositories
        </Text>
        {repositories.length === 0 ? (
          <EmptyView
            icon="(◔_◔)"
            description={
              'Add a voices.json URL to download on-device Kokoro voices.'
            }
            theme={theme}
          />
        ) : (
          repositories.map(repo => (
            <View
              key={repo.id}
              style={[
                styles.repoRow,
                { backgroundColor: theme.secondaryContainer },
              ]}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[styles.repoUrl, { color: theme.onSurface }]}
              >
                {repo.url}
              </Text>
              <Switch
                value={repo.enabled}
                onValueChange={() =>
                  setVoiceRepositoryEnabled(repo.id, !repo.enabled).then(
                    refreshManifests,
                  )
                }
              />
              <IconButtonV2
                name="delete-outline"
                color={theme.onSurface}
                onPress={() =>
                  deleteVoiceRepositoryById(repo.id).then(refreshManifests)
                }
                theme={theme}
              />
            </View>
          ))
        )}

        {manifests.length > 0 ? (
          <>
            <Text
              style={[styles.sectionTitle, { color: theme.onSurfaceVariant }]}
            >
              Voice packs
            </Text>
            {manifests.map(loaded => {
              const { engine } = loaded.manifest;
              const state = engineState[engine.id] ?? { installed: false };
              return (
                <View
                  key={engine.id}
                  style={[
                    styles.packRow,
                    { backgroundColor: theme.secondaryContainer },
                  ]}
                >
                  <View style={styles.packInfo}>
                    <Text style={[styles.packName, { color: theme.onSurface }]}>
                      {engine.name}
                    </Text>
                    <Text
                      style={[
                        styles.packMeta,
                        { color: theme.onSurfaceVariant },
                      ]}
                    >
                      {loaded.manifest.voices.length} voice
                      {loaded.manifest.voices.length === 1 ? '' : 's'}
                    </Text>
                    {state.busy ? (
                      <ProgressBar
                        progress={state.progress ?? 0}
                        color={theme.primary}
                        style={styles.progress}
                      />
                    ) : null}
                  </View>
                  {state.installed ? (
                    <Button
                      mode="text"
                      textColor={theme.error}
                      onPress={() => remove(engine.id, engine.name)}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      mode="contained-tonal"
                      loading={state.busy}
                      disabled={state.busy}
                      onPress={() => download(loaded)}
                    >
                      Download
                    </Button>
                  )}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

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
          <Dialog.Title>Add voice repository</Dialog.Title>
          <Dialog.Content>
            <TextInput
              autoFocus
              mode="outlined"
              placeholder="https://…/voices.json"
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

export default SettingsVoiceRepositoryScreen;

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
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
  packRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    padding: 12,
  },
  packInfo: { flex: 1 },
  packName: { fontSize: 16, fontWeight: '600' },
  packMeta: { fontSize: 12, marginTop: 2 },
  progress: { borderRadius: 4, marginTop: 8 },
  fab: { margin: 16, position: 'absolute', right: 0 },
});
