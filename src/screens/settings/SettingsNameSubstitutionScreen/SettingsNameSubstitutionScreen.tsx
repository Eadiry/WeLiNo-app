import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Dialog,
  FAB,
  IconButton,
  Portal,
  TextInput,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Appbar,
  EmptyView,
  SafeAreaView,
  SegmentedControl,
  SwitchItem,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { useBoolean } from '@hooks/index';
import { showToast } from '@utils/showToast';

import { getAllNovels } from '@database/queries/NovelQueries';
import {
  createNameSubstitution,
  deleteNameSubstitution,
  getNameSubstitutions,
  moveNameSubstitution,
  updateNameSubstitution,
  type NameSubstitutionDraft,
} from '@database/queries/NameSubstitutionQueries';
import type { NameSubstitutionRule } from '@services/nameSubstitution';
import type { NovelInfo } from '@database/types';
import type { NameSubstitutionSettingsScreenProps } from '@navigators/types';

const emptyForm = (): NameSubstitutionDraft => ({
  pattern: '',
  replacement: '',
  kind: 'plain',
  wholeWord: true,
  caseSensitive: false,
  preserveCase: true,
  enabled: true,
  note: null,
});

const SettingsNameSubstitutionScreen = ({
  route: { params },
  navigation,
}: NameSubstitutionSettingsScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();

  const [novels, setNovels] = useState<NovelInfo[]>([]);
  const [novelId, setNovelId] = useState<number | undefined>(params?.novelId);
  const [rules, setRules] = useState<NameSubstitutionRule[]>([]);

  const {
    value: editorVisible,
    setTrue: openEditor,
    setFalse: closeEditor,
  } = useBoolean();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<NameSubstitutionDraft>(emptyForm());

  useEffect(() => {
    getAllNovels().then(all =>
      setNovels(
        all
          .filter(n => n.inLibrary)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }, []);

  const reload = useCallback(async () => {
    if (novelId == null) {
      setRules([]);
      return;
    }
    setRules(await getNameSubstitutions(novelId));
  }, [novelId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = novelId == null ? [] : await getNameSubstitutions(novelId);
      if (!cancelled) setRules(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  const selectedNovel = useMemo(
    () => novels.find(n => n.id === novelId),
    [novels, novelId],
  );

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    openEditor();
  };

  const startEdit = (rule: NameSubstitutionRule) => {
    setEditingId(rule.id);
    setForm({
      pattern: rule.pattern,
      replacement: rule.replacement,
      kind: rule.kind,
      wholeWord: rule.wholeWord,
      caseSensitive: rule.caseSensitive,
      preserveCase: rule.preserveCase,
      enabled: rule.enabled,
      note: rule.note,
    });
    openEditor();
  };

  const save = async () => {
    if (!form.pattern.trim()) {
      showToast('Enter something to find.');
      return;
    }
    if (novelId == null) return;
    try {
      if (editingId == null) {
        await createNameSubstitution(novelId, form);
      } else {
        await updateNameSubstitution(editingId, form);
      }
      closeEditor();
      await reload();
    } catch (e: any) {
      showToast(e?.message ?? 'Could not save the rule.');
    }
  };

  const toggle = async (rule: NameSubstitutionRule) => {
    await updateNameSubstitution(rule.id, { enabled: !rule.enabled });
    await reload();
  };

  const remove = async (rule: NameSubstitutionRule) => {
    await deleteNameSubstitution(rule.id);
    await reload();
  };

  const move = async (rule: NameSubstitutionRule, dir: 'up' | 'down') => {
    await moveNameSubstitution(rule.id, dir);
    await reload();
  };

  const renderNovel = ({ item }: { item: NovelInfo }) => (
    <SwitchItem
      value={item.id === novelId}
      label={item.name}
      onPress={() => setNovelId(item.id)}
      theme={theme}
    />
  );

  const renderRule = ({
    item,
    index,
  }: {
    item: NameSubstitutionRule;
    index: number;
  }) => (
    <View style={[styles.ruleRow, { borderBottomColor: theme.outline }]}>
      <View style={styles.ruleText}>
        <Text
          style={[
            styles.rulePattern,
            { color: item.enabled ? theme.onSurface : theme.onSurfaceDisabled },
          ]}
          numberOfLines={1}
        >
          {item.pattern} → {item.replacement || '(remove)'}
        </Text>
        <Text
          style={[styles.ruleMeta, { color: theme.onSurfaceVariant }]}
          numberOfLines={1}
        >
          {item.kind === 'regex'
            ? 'regex'
            : [
                item.wholeWord ? 'whole word' : null,
                item.caseSensitive ? 'case-sensitive' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'plain'}
        </Text>
      </View>
      <IconButton
        icon="arrow-up"
        size={20}
        disabled={index === 0}
        onPress={() => move(item, 'up')}
        iconColor={theme.onSurfaceVariant}
      />
      <IconButton
        icon="arrow-down"
        size={20}
        disabled={index === rules.length - 1}
        onPress={() => move(item, 'down')}
        iconColor={theme.onSurfaceVariant}
      />
      <IconButton
        icon={item.enabled ? 'eye-outline' : 'eye-off-outline'}
        size={20}
        onPress={() => toggle(item)}
        iconColor={theme.onSurfaceVariant}
      />
      <IconButton
        icon="pencil-outline"
        size={20}
        onPress={() => startEdit(item)}
        iconColor={theme.onSurfaceVariant}
      />
      <IconButton
        icon="delete-outline"
        size={20}
        onPress={() => remove(item)}
        iconColor={theme.onSurfaceVariant}
      />
    </View>
  );

  return (
    <SafeAreaView>
      <Appbar
        title="Character names"
        handleGoBack={navigation.goBack}
        theme={theme}
      />

      {novelId == null ? (
        <FlatList
          data={novels}
          keyExtractor={n => String(n.id)}
          renderItem={renderNovel}
          ListHeaderComponent={
            <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
              Pick a novel to manage its character-name substitutions.
            </Text>
          }
          ListEmptyComponent={
            <EmptyView
              icon="(･Д･。"
              description="No novels in your library yet."
              theme={theme}
            />
          }
        />
      ) : (
        <>
          <View style={[styles.novelBar, { borderBottomColor: theme.outline }]}>
            <Text
              style={[styles.novelName, { color: theme.onSurface }]}
              numberOfLines={1}
            >
              {selectedNovel?.name ?? 'Selected novel'}
            </Text>
            <Button compact onPress={() => setNovelId(undefined)}>
              Change
            </Button>
          </View>

          <FlatList
            data={rules}
            keyExtractor={r => String(r.id)}
            renderItem={renderRule}
            contentContainerStyle={{ paddingBottom: 88 + bottom }}
            ListEmptyComponent={
              <EmptyView
                icon="(￣y▽￣)╭"
                description={
                  'No rules yet.\nTap + to replace a name everywhere in this novel.'
                }
                theme={theme}
              />
            }
          />

          <FAB
            icon="plus"
            style={[
              styles.fab,
              {
                backgroundColor: theme.primary,
                right: right + 16,
                bottom: bottom + 16,
              },
            ]}
            color={theme.onPrimary}
            onPress={startAdd}
          />
        </>
      )}

      <Portal>
        <Dialog
          visible={editorVisible}
          onDismiss={closeEditor}
          style={{ backgroundColor: theme.overlay3 }}
        >
          <Dialog.Title style={{ color: theme.onSurface }}>
            {editingId == null ? 'New rule' : 'Edit rule'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Find"
              value={form.pattern}
              onChangeText={t => setForm(f => ({ ...f, pattern: t }))}
              autoCapitalize="none"
              autoCorrect={false}
              dense
            />
            <View style={styles.gap} />
            <TextInput
              mode="outlined"
              label="Replace with"
              value={form.replacement}
              onChangeText={t => setForm(f => ({ ...f, replacement: t }))}
              autoCapitalize="none"
              autoCorrect={false}
              dense
            />
            <View style={styles.gap} />
            <SegmentedControl<'plain' | 'regex'>
              options={[
                { value: 'plain', label: 'Plain' },
                { value: 'regex', label: 'Regex' },
              ]}
              value={form.kind}
              onChange={kind => setForm(f => ({ ...f, kind }))}
              theme={theme}
            />
            {form.kind === 'plain' ? (
              <>
                <SwitchItem
                  value={form.wholeWord}
                  label="Whole word only"
                  onPress={() =>
                    setForm(f => ({ ...f, wholeWord: !f.wholeWord }))
                  }
                  theme={theme}
                />
                <SwitchItem
                  value={form.caseSensitive}
                  label="Case-sensitive"
                  onPress={() =>
                    setForm(f => ({ ...f, caseSensitive: !f.caseSensitive }))
                  }
                  theme={theme}
                />
                <SwitchItem
                  value={form.preserveCase}
                  label="Match the original's case"
                  description="ALL CAPS → ALL CAPS, Title → Title"
                  onPress={() =>
                    setForm(f => ({ ...f, preserveCase: !f.preserveCase }))
                  }
                  theme={theme}
                />
              </>
            ) : (
              <Text
                style={[styles.regexHint, { color: theme.onSurfaceVariant }]}
              >
                Pattern is a regular expression. Use $1–$9 / $&amp; in the
                replacement.
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeEditor}>Cancel</Button>
            <Button onPress={save}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

export default SettingsNameSubstitutionScreen;

const styles = StyleSheet.create({
  hint: { padding: 16, paddingBottom: 8, fontSize: 13 },
  novelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  novelName: { flex: 1, fontSize: 15, fontWeight: '600' },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    borderBottomWidth: 1,
  },
  ruleText: { flex: 1, paddingVertical: 10 },
  rulePattern: { fontSize: 15 },
  ruleMeta: { fontSize: 12, marginTop: 2 },
  fab: { position: 'absolute', margin: 16 },
  gap: { height: 12 },
  regexHint: { fontSize: 12, marginTop: 12 },
});
