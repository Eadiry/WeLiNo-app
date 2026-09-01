import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import color from 'color';

import { IconButtonV2, Menu } from '../../../components';
import Animated, {
  Easing,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';
import { ThemeColors } from '@theme/types';
import { bookmarkChapter } from '@database/queries/ChapterQueries';
import { useChapterContext } from '../ChapterContext';
import { useNovelLayout } from '@screens/novel/NovelContext';
import ReaderSearchbar from './ReaderSearchbar';
import { ReaderSearchResult } from '../types';
import { getString } from '@i18n/translations';

interface ReaderAppbarProps {
  theme: ThemeColors;
  goBack: () => void;
  bookmarked: boolean;
  setBookmarked: React.Dispatch<React.SetStateAction<boolean>>;
  searchVisible: boolean;
  setSearchVisible: React.Dispatch<React.SetStateAction<boolean>>;
  searchText: string;
  setSearchText: (text: string) => void;
  searchResult: ReaderSearchResult;
  resetSearchResult: () => void;
  resetSearch: () => void;
  openInWebView: () => void;
  openInBrowser: () => void;
  shareChapter: () => void;
  openSettingsPanel: () => void;
  startTts: () => void;
  downloadChapter: () => void;
  isDownloaded: boolean;
}

const fastOutSlowIn = Easing.bezier(0.4, 0.0, 0.2, 1.0);

const ReaderAppbar = ({
  goBack,
  theme,
  bookmarked,
  setBookmarked,
  searchVisible,
  setSearchVisible,
  searchText,
  setSearchText,
  searchResult,
  resetSearchResult,
  resetSearch,
  openInWebView,
  openInBrowser,
  shareChapter,
  openSettingsPanel,
  startTts,
  downloadChapter,
  isDownloaded,
}: ReaderAppbarProps) => {
  const { chapter, novel, refetch } = useChapterContext();
  const { statusBarHeight } = useNovelLayout();
  const [menuVisible, setMenuVisible] = useState(false);

  const runMenuAction = useCallback((action: () => void) => {
    setMenuVisible(false);
    action();
  }, []);

  const entering = () => {
    'worklet';
    const animations = {
      originY: withTiming(0, {
        duration: 250,
        easing: fastOutSlowIn,
        reduceMotion: ReduceMotion.System,
      }),
      opacity: withTiming(1, { duration: 150 }),
    };
    const initialValues = {
      originY: -statusBarHeight,
      opacity: 0,
    };
    return {
      initialValues,
      animations,
    };
  };
  const exiting = () => {
    'worklet';
    const animations = {
      originY: withTiming(-statusBarHeight, {
        duration: 250,
        easing: fastOutSlowIn,
        reduceMotion: ReduceMotion.System,
      }),
      opacity: withTiming(0, { duration: 150 }),
    };
    const initialValues = {
      originY: 0,
      opacity: 1,
    };
    return {
      initialValues,
      animations,
    };
  };

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      style={[
        styles.container,
        {
          paddingTop: statusBarHeight,
          backgroundColor: color(theme.surface).alpha(0.9).string(),
        },
      ]}
    >
      <View style={styles.appbar}>
        <IconButtonV2
          name={searchVisible ? 'arrow-left' : 'close'}
          onPress={searchVisible ? () => setSearchVisible(false) : goBack}
          color={theme.onSurface}
          size={26}
          theme={theme}
        />
        <View style={styles.spacer} />
        {!searchVisible ? (
          <>
            <IconButtonV2
              name="headphones"
              size={24}
              padding={12}
              onPress={startTts}
              color={theme.onSurface}
              theme={theme}
              accessibilityLabel="Text to speech"
            />
            <IconButtonV2
              name="format-size"
              size={24}
              padding={12}
              onPress={openSettingsPanel}
              color={theme.onSurface}
              theme={theme}
              accessibilityLabel={getString('readerSettings.title')}
            />
            {!novel.isLocal ? (
              <IconButtonV2
                name={isDownloaded ? 'check-circle' : 'download'}
                size={24}
                padding={12}
                onPress={downloadChapter}
                color={isDownloaded ? theme.primary : theme.onSurface}
                theme={theme}
                accessibilityLabel={getString('common.download')}
              />
            ) : null}
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <IconButtonV2
                  accessibilityLabel={getString('common.moreOptions')}
                  name="dots-vertical"
                  size={24}
                  padding={12}
                  onPress={() => setMenuVisible(true)}
                  color={theme.onSurface}
                  theme={theme}
                />
              }
            >
              <Menu.Item
                title={
                  bookmarked
                    ? getString('common.bookmarkRemove')
                    : getString('common.bookmark')
                }
                onPress={() =>
                  runMenuAction(() => {
                    bookmarkChapter(chapter.id).then(() =>
                      setBookmarked(!bookmarked),
                    );
                  })
                }
              />
              <Menu.Item
                title={getString('common.search')}
                onPress={() => runMenuAction(() => setSearchVisible(true))}
              />
              {!novel.isLocal ? (
                <>
                  <Menu.Item
                    title={getString('webview.refresh')}
                    onPress={() => runMenuAction(refetch)}
                  />
                  <Menu.Item
                    title={getString('webview.openInWebView')}
                    onPress={() => runMenuAction(openInWebView)}
                  />
                  <Menu.Item
                    title={getString('webview.openInBrowser')}
                    onPress={() => runMenuAction(openInBrowser)}
                  />
                  <Menu.Item
                    title={getString('webview.share')}
                    onPress={() => runMenuAction(shareChapter)}
                  />
                </>
              ) : null}
            </Menu>
          </>
        ) : null}
      </View>
      {searchVisible ? (
        <ReaderSearchbar
          theme={theme}
          searchText={searchText}
          setSearchText={setSearchText}
          searchResult={searchResult}
          resetSearchResult={resetSearchResult}
          resetSearch={resetSearch}
        />
      ) : null}
    </Animated.View>
  );
};

export default ReaderAppbar;

const styles = StyleSheet.create({
  appbar: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 4,
  },
  container: {
    flex: 1,
    paddingBottom: 8,
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 1,
  },
  spacer: {
    flex: 1,
  },
});
