import { ScrollView, StyleSheet } from 'react-native';

import { Appbar, List, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';

import { getString } from '@i18n/translations';
import { SettingsScreenProps } from '@navigators/types';
import { KOKORO_SUPPORTED } from '@services/tts/voiceRepository';

const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const theme = useTheme();

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.settings')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView style={[{ backgroundColor: theme.background }, styles.flex]}>
        <List.Item
          title={getString('generalSettings')}
          icon="tune"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'GeneralSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title={getString('appearance')}
          icon="palette-outline"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'AppearanceSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title={getString('library')}
          icon="bookshelf"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'LibrarySettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title={getString('readerSettings.title')}
          icon="book-open-outline"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'ReaderSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title="Repositories"
          icon="github"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'RespositorySettings',
            })
          }
          theme={theme}
        />
        {KOKORO_SUPPORTED ? (
          <List.Item
            title="Voice repositories"
            description="On-device Kokoro TTS voices"
            icon="account-voice"
            onPress={() =>
              navigation.navigate('SettingsStack', {
                screen: 'VoiceRepositorySettings',
              })
            }
            theme={theme}
          />
        ) : null}
        <List.Item
          title="Character name substitutions"
          description="Per-novel find/replace for names, applied to text and TTS"
          icon="account-switch-outline"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'NameSubstitutionSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title="Manga repositories"
          description="Manga/manhua/manhwa plugin sources"
          icon="image-multiple-outline"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'MangaRepositorySettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title="Custom Code"
          icon="code-braces"
          onPress={() => navigation.navigate('CustomCode')}
          theme={theme}
        />
        <List.Item
          title={getString('tracking')}
          icon="sync"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'TrackerSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title={getString('common.backup')}
          icon="cloud-upload-outline"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'BackupSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettings')}
          icon="code-tags"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'AdvancedSettings',
            })
          }
          theme={theme}
        />
        <List.Item
          title={getString('genreStats.taxonomyTitle')}
          icon="tag-multiple-outline"
          onPress={() =>
            navigation.navigate('SettingsStack', {
              screen: 'GenreTaxonomy',
            })
          }
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
