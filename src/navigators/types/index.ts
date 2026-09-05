import { ChapterInfo, NovelInfo } from '@database/types';
import type { MangaChapterRow, MangaRow } from '@database/schema';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialBottomTabScreenProps } from 'react-native-paper';

export type RootStackParamList = {
  BottomNavigator: NavigatorScreenParams<BottomNavigatorParamList> | undefined;
  ReaderStack: NavigatorScreenParams<ReaderStackParamList>;
  MoreStack: NavigatorScreenParams<MoreStackParamList>;
  SourceScreen: {
    pluginId: string;
    pluginName: string;
    site: string;
    showLatestNovels?: boolean;
  };
  BrowseMal: undefined;
  BrowseAL: undefined;
  BrowseSettings: undefined;
  PluginDetails: { pluginId: string };
  GlobalSearchScreen: { searchText?: string };
  Migration: undefined;
  SourceNovels: { pluginId: string };
  MigrateNovel: { novel: NovelInfo };
  WebviewScreen: {
    name: string;
    url: string;
    pluginId: string;
    isNovel?: boolean;
  };
  MangaBrowseScreen: undefined;
  MangaSourceScreen: { pluginId: string; pluginName: string };
  MangaScreen:
    | MangaRow
    | { path: string; pluginId: string; name: string; cover?: string | null };
  MangaChapterScreen: { manga: MangaRow; chapter: MangaChapterRow };
};

export type BottomNavigatorParamList = {
  Library: undefined;
  Updates: undefined;
  History: undefined;
  Browse: undefined;
  Manga: undefined;
  More: undefined;
};

export type MangaLibraryScreenProps = CompositeScreenProps<
  MaterialBottomTabScreenProps<BottomNavigatorParamList, 'Manga'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type MangaBrowseScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MangaBrowseScreen'
>;

export type MangaSourceScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MangaSourceScreen'
>;

export type MangaScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MangaScreen'
>;

export type MangaChapterScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MangaChapterScreen'
>;

export type LibraryScreenProps = CompositeScreenProps<
  MaterialBottomTabScreenProps<BottomNavigatorParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type HistoryScreenProps = CompositeScreenProps<
  MaterialBottomTabScreenProps<BottomNavigatorParamList, 'History'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type UpdateScreenProps = CompositeScreenProps<
  MaterialBottomTabScreenProps<BottomNavigatorParamList, 'Updates'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type BrowseScreenProps = CompositeScreenProps<
  MaterialBottomTabScreenProps<BottomNavigatorParamList, 'Browse'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type MoreStackScreenProps = CompositeScreenProps<
  MaterialBottomTabScreenProps<BottomNavigatorParamList, 'More'>,
  NativeStackScreenProps<RootStackParamList, 'MoreStack'>
>;
export type MoreStackParamList = {
  SettingsStack: NavigatorScreenParams<SettingsStackParamList>;
  About: undefined;
  TaskQueue: undefined;
  Downloads: undefined;
  Categories: undefined;
  Statistics: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
  GeneralSettings: undefined;
  ReaderSettings: undefined;
  TrackerSettings: undefined;
  BackupSettings: undefined;
  AppearanceSettings: undefined;
  AdvancedSettings: undefined;
  LibrarySettings: undefined;
  RespositorySettings: { url?: string } | undefined;
  VoiceRepositorySettings: { url?: string } | undefined;
  NameSubstitutionSettings: { novelId?: number } | undefined;
  MangaRepositorySettings: { url?: string } | undefined;
  CustomCode: undefined;
  CodeSnippets: { snippetIndex: number; isJS: boolean } | undefined;
  GenreTaxonomy: undefined;
};

export type NovelScreenProps = NativeStackScreenProps<
  ReaderStackParamList & RootStackParamList,
  'Novel'
>;
export type ChapterScreenProps = NativeStackScreenProps<
  ReaderStackParamList & RootStackParamList,
  'Chapter'
>;
export type ReaderStackParamList = {
  Novel:
    | {
        name: string;
        path: string;
        pluginId: string;
        cover: string | null;
        isLocal?: boolean | null;
      }
    | Omit<NovelInfo, 'id'>;
  Chapter: {
    novel: NovelInfo;
    chapter: ChapterInfo;
  };
};

export type AboutScreenProps = NativeStackScreenProps<
  MoreStackParamList,
  'About'
>;
export type DownloadsScreenProps = NativeStackScreenProps<
  MoreStackParamList,
  'Downloads'
>;
export type TaskQueueScreenProps = NativeStackScreenProps<
  MoreStackParamList,
  'TaskQueue'
>;
export type BrowseSourceScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'SourceScreen'
>;
export type BrowseMalScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'BrowseMal'
>;
export type BrowseALScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'BrowseAL'
>;
export type BrowseSettingsScreenProp = NativeStackScreenProps<
  RootStackParamList,
  'BrowseSettings'
>;
export type PluginDetailsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'PluginDetails'
>;
export type GlobalSearchScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'GlobalSearchScreen'
>;
export type MigrationScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Migration'
>;
export type MigrateNovelScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MigrateNovel'
>;
export type SourceNovelsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'SourceNovels'
>;
export type WebviewScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'WebviewScreen'
>;
export type SettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'Settings'>,
  NativeStackScreenProps<MoreStackParamList, 'SettingsStack'>
>;
export type AppearanceSettingsScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'AppearanceSettings'
>;
export type TrackerSettingsScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'TrackerSettings'
>;
export type BackupSettingsScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'BackupSettings'
>;
export type AdvancedSettingsScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'AdvancedSettings'
>;
export type LibrarySettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'LibrarySettings'>,
  NativeStackScreenProps<MoreStackParamList, 'SettingsStack'>
>;
export type GenreTaxonomyScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'GenreTaxonomy'>,
  NativeStackScreenProps<MoreStackParamList, 'SettingsStack'>
>;

export type RespositorySettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'RespositorySettings'>,
  NativeStackScreenProps<RootStackParamList, 'BottomNavigator'>
>;

export type VoiceRepositorySettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'VoiceRepositorySettings'>,
  NativeStackScreenProps<RootStackParamList, 'BottomNavigator'>
>;

export type NameSubstitutionSettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'NameSubstitutionSettings'>,
  NativeStackScreenProps<RootStackParamList, 'BottomNavigator'>
>;

export type MangaRepositorySettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'MangaRepositorySettings'>,
  NativeStackScreenProps<RootStackParamList, 'BottomNavigator'>
>;

export type CustomCodeSettingsScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'CustomCode'
>;
export type CodeSnippetsScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'CodeSnippets'
>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
