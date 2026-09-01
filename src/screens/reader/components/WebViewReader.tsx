import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import * as Linking from 'expo-linking';
import color from 'color';

import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { getPlugin } from '@plugins/pluginManager';
import { MMKVStorage, getMMKVObject } from '@utils/mmkv/mmkv';
import {
  CHAPTER_GENERAL_SETTINGS,
  CHAPTER_READER_SETTINGS,
  ChapterGeneralSettings,
  ChapterReaderSettings,
  initialChapterGeneralSettings,
  initialChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getBatteryLevel } from 'react-native-device-info';
import { PLUGIN_STORAGE } from '@utils/Storages';
import { useChapterContext } from '../ChapterContext';
import { ReaderSearchResult } from '../types';
import { useTtsSession } from '../hooks/useTtsSession';
import type { TtsSettings } from '@modules/nitro-tts';
import { ChapterInfo } from '@database/types';
import { Dialog } from '@components/Dialog';
import { TextInput } from 'react-native-paper';
import useCustomCode from './Hooks/useCustomCode';
import useTextModifications from './Hooks/useTextModifications';
import {
  isChapterRefreshUrl,
  isPluginIssueReportUrl,
} from '../utils/sanitizeChapterText';
import { READER_CSS, READER_SCRIPTS } from '../utils/readerAssets';

export type WebViewPostEvent = {
  type: string;
  data?: unknown;
  autoStartTTS?: boolean;
  index?: number;
  total?: number;
};

type WebViewReaderProps = {
  onPress(): void;
  onTouchStart?(): void;
  onSearchResult(result: ReaderSearchResult): void;
  searchTextRef: React.MutableRefObject<string>;
  onProgress?(progress: number): void;
};

const onLogMessage = (payload: { nativeEvent: { data: string } }) => {
  const dataPayload = JSON.parse(payload.nativeEvent.data);
  if (dataPayload) {
    if (dataPayload.type === 'console') {
      /* eslint-disable no-console */
      console.info(`[Console] ${JSON.stringify(dataPayload.msg, null, 2)}`);
    }
  }
};

/** Checks whether two TTS settings objects are equal */
const areTTSSettingsEqual = (
  a: ChapterReaderSettings['tts'],
  b: ChapterReaderSettings['tts'],
) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.rate === b.rate &&
    a.pitch === b.pitch &&
    a.autoPageAdvance === b.autoPageAdvance &&
    a.scrollToTop === b.scrollToTop &&
    a.voice?.identifier === b.voice?.identifier &&
    a.engine?.name === b.engine?.name
  );
};

const toNativeTtsSettings = (
  settings: ChapterReaderSettings['tts'],
): TtsSettings => ({
  engineName: settings?.engine?.name,
  voiceIdentifier: settings?.voice?.identifier,
  rate: settings?.rate ?? 1,
  pitch: settings?.pitch ?? 1,
});

/**
 * The adjacent chapters are resolved after the chapter itself is on screen, so
 * they are pushed into the loaded page instead of being baked into the HTML –
 * rebuilding the HTML would reload the WebView and lose the reading position.
 */
const buildAdjacentChapterScript = (
  nextChapter?: ChapterInfo,
  prevChapter?: ChapterInfo,
) => `
  window.reader?.setAdjacentChapters?.(${JSON.stringify({
    nextChapter,
    prevChapter,
    strings: {
      nextChapter: getString('readerScreen.nextChapter', {
        name: nextChapter?.name,
      }),
    },
  })});
  true;
`;

const { RNDeviceInfo } = NativeModules;
const deviceInfoEmitter = new NativeEventEmitter(RNDeviceInfo);

/**
 * Last level seen, so a chapter can be rendered without the synchronous native
 * call the sync variant of this API performs. It is refreshed asynchronously
 * and pushed into the page, which also happens on every battery change event.
 */
let lastKnownBatteryLevel = 0;

const WebViewReader: React.FC<WebViewReaderProps> = ({
  onPress,
  onTouchStart,
  onSearchResult,
  searchTextRef,
  onProgress,
}) => {
  const {
    novel,
    chapter,
    chapterText: html,
    navigateChapter,
    saveProgress,
    nextChapter,
    prevChapter,
    webViewRef,
    onUserInteraction,
    isTTSReadingRef,
    refetch,
  } = useChapterContext();
  const theme = useTheme();
  const { top: safeAreaTop, bottom: safeAreaBottom } = useSafeAreaInsets();
  /**
   * `StatusBar.currentHeight` is Android-only (undefined on iOS), so on iOS the
   * page rendered flush to the top edge — under the notch / Dynamic Island.
   * Use the measured safe-area inset there instead, and pad the bottom past
   * the home indicator.
   */
  const readerTopInset =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : safeAreaTop;
  const readerBottomInset = Platform.OS === 'android' ? 0 : safeAreaBottom;
  // Snapshot at mount for the baked-in document. Later inset changes (rotation)
  // are pushed with injectJavaScript below so `source` stays stable and the
  // WebView is never reloaded — a reload would drop the reading position.
  const [mountInsets] = useState(() => ({
    top: readerTopInset,
    bottom: readerBottomInset,
  }));
  const initialReaderSettings = useMemo(
    () => ({
      ...initialChapterReaderSettings,
      ...getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS),
    }), // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );

  const chapterGeneralSettings = useMemo(
    () => ({
      ...initialChapterGeneralSettings,
      ...getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS),
    }),
    // needed to preserve settings during chapter change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );

  const [batteryLevel] = useState(lastKnownBatteryLevel);
  const plugin = getPlugin(novel?.pluginId);
  const pluginCustomJS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.js`;
  const pluginCustomCSS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.css`;
  const nextChapterScreenVisible = useRef<boolean>(false);
  const autoStartTTSRef = useRef<boolean>(false);
  const activeChapterIdRef = useRef(chapter.id);
  const adjacentChapterScriptRef = useRef(buildAdjacentChapterScript());
  const {
    command: runTtsCommand,
    loadAndPlay,
    progress: ttsProgress,
    seekTo: seekTts,
    state: ttsState,
    updateSettings: updateTtsSettings,
  } = useTtsSession();

  const { customJS, customCSS } = useCustomCode(initialReaderSettings);

  const {
    html: processedHtml,
    replaceModalVisible,
    setReplaceModalVisible,
    selectedTextForReplace,
    replacementText,
    setReplacementText,
    handleReplaceSave,
    handleReplaceCancel,
    eventTextAction,
  } = useTextModifications(html, webViewRef);

  const [readerSettings, setReaderSettings] = useState(
    () =>
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
      initialChapterReaderSettings,
  );

  const readerSettingsRef = useRef<ChapterReaderSettings>(readerSettings);

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
  }, [readerSettings]);

  useEffect(() => {
    isTTSReadingRef.current = ttsState === 'playing';
    webViewRef.current?.injectJavaScript(`
      window.tts?.setPlaybackState?.(${JSON.stringify(ttsState)});
      true;
    `);
    if (ttsState === 'completed') {
      webViewRef.current?.injectJavaScript('window.tts?.complete?.(); true;');
    }
  }, [isTTSReadingRef, ttsState, webViewRef]);

  useEffect(() => {
    if (ttsProgress.total > 0) {
      webViewRef.current?.injectJavaScript(`
        window.tts?.setActiveIndex?.(${ttsProgress.index});
        true;
      `);
    }
  }, [ttsProgress, webViewRef]);

  useEffect(() => {
    if (activeChapterIdRef.current !== chapter.id) {
      activeChapterIdRef.current = chapter.id;
      runTtsCommand('stop');
    }
  }, [chapter.id, runTtsCommand]);

  useEffect(() => {
    const script = buildAdjacentChapterScript(nextChapter, prevChapter);
    // Kept for onLoadEnd: an update that lands before the document is ready is
    // dropped by the WebView, so it is replayed once the page has loaded.
    adjacentChapterScriptRef.current = script;
    webViewRef.current?.injectJavaScript(script);
  }, [nextChapter, prevChapter, webViewRef]);

  useEffect(() => {
    const mmkvListener = MMKVStorage.addOnValueChangedListener(key => {
      switch (key) {
        case CHAPTER_READER_SETTINGS: {
          // Update reader settings
          const newReaderSettings =
            getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
            initialChapterReaderSettings;
          setReaderSettings(newReaderSettings);
          if (
            !areTTSSettingsEqual(
              readerSettingsRef.current.tts,
              newReaderSettings.tts,
            )
          ) {
            updateTtsSettings(toNativeTtsSettings(newReaderSettings.tts));
          }
          // Update WebView settings
          webViewRef.current?.injectJavaScript(
            `
            reader.readerSettings.val = ${JSON.stringify(newReaderSettings)}
            `,
          );
          break;
        }
        case CHAPTER_GENERAL_SETTINGS: {
          const newGeneralSettings =
            getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ||
            initialChapterGeneralSettings;
          webViewRef.current?.injectJavaScript(
            `reader.generalSettings.val = ${JSON.stringify(
              newGeneralSettings,
            )}`,
          );
          // The paragraph indent / gap are CSS vars baked into the document,
          // so push them live when the panel toggles change.
          webViewRef.current?.injectJavaScript(
            `document.documentElement.style.setProperty('--readerSettings-textIndent', ${JSON.stringify(
              newGeneralSettings.removeTextIndent ? '0' : '1.5em',
            )});
             document.documentElement.style.setProperty('--readerSettings-paragraphGap', ${JSON.stringify(
               newGeneralSettings.removeExtraParagraphSpacing ? '0px' : '1em',
             )});
             true;`,
          );
          break;
        }
      }
    });

    const subscription = deviceInfoEmitter.addListener(
      'RNDeviceInfo_batteryLevelDidChange',
      (level: number) => {
        lastKnownBatteryLevel = level;
        webViewRef.current?.injectJavaScript(
          `reader.batteryLevel.val = ${level}`,
        );
      },
    );

    getBatteryLevel().then(level => {
      lastKnownBatteryLevel = level;
      webViewRef.current?.injectJavaScript(
        `if (window.reader?.batteryLevel) {
          window.reader.batteryLevel.val = ${level};
        }`,
      );
    });

    return () => {
      subscription.remove();
      mmkvListener.remove();
    };
  }, [updateTtsSettings, webViewRef]);

  // Safe-area insets change on rotation. Push them into the live document
  // instead of rebuilding `source` (which reloads the WebView and loses the
  // reading position).
  useEffect(() => {
    webViewRef.current?.injectJavaScript(
      `document.documentElement.style.setProperty('--StatusBar-currentHeight', '${readerTopInset}px');
       document.documentElement.style.setProperty('--reader-bottom-inset', '${readerBottomInset}px');
       true;`,
    );
  }, [readerTopInset, readerBottomInset, webViewRef]);

  const isRTL = plugin?.lang === 'Arabic' || plugin?.lang === 'Hebrew';
  const readerDir = isRTL ? 'rtl' : 'ltr';

  /**
   * Serialising the whole chapter is expensive, so the document is built once
   * per chapter. Handing the WebView a different `source` also reloads the
   * page, so nothing that changes while a chapter is on screen may be part of
   * it – those updates go through `injectJavaScript` instead.
   */
  const source = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs
    const isNextChapterScreenVisible = nextChapterScreenVisible.current;
    const { top: topInset, bottom: bottomInset } = mountInsets;
    return {
      baseUrl: !chapter.isDownloaded ? plugin?.site : undefined,
      headers: plugin?.imageRequestInit?.headers,
      method: plugin?.imageRequestInit?.method,
      body: plugin?.imageRequestInit?.body,
      html: `
        <!DOCTYPE html>
          <html dir="${readerDir}">
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover">
              <style id="ln-reader-assets">${READER_CSS}</style>
              <style>
              :root {
                --StatusBar-currentHeight: ${topInset}px;
                --reader-bottom-inset: ${bottomInset}px;
                --readerSettings-textIndent: ${
                  chapterGeneralSettings.removeTextIndent ? '0' : '1.5em'
                };
                --readerSettings-paragraphGap: ${
                  chapterGeneralSettings.removeExtraParagraphSpacing
                    ? '0px'
                    : '1em'
                };
                --readerSettings-theme: ${initialReaderSettings.theme};
                --readerSettings-padding: ${initialReaderSettings.padding}px;
                --readerSettings-textSize: ${initialReaderSettings.textSize}px;
                --readerSettings-textColor: ${initialReaderSettings.textColor};
                --readerSettings-textAlign: ${initialReaderSettings.textAlign};
                --readerSettings-lineHeight: ${
                  initialReaderSettings.lineHeight
                };
                --readerSettings-fontFamily: ${
                  initialReaderSettings.fontFamily
                };
                --theme-primary: ${theme.primary};
                --theme-onPrimary: ${theme.onPrimary};
                --theme-secondary: ${theme.secondary};
                --theme-tertiary: ${theme.tertiary};
                --theme-onTertiary: ${theme.onTertiary};
                --theme-onSecondary: ${theme.onSecondary};
                --theme-surface: ${theme.surface};
                --theme-surface-0-9: ${color(theme.surface)
                  .alpha(0.9)
                  .toString()};
                --theme-onSurface: ${theme.onSurface};
                --theme-surfaceVariant: ${theme.surfaceVariant};
                --theme-onSurfaceVariant: ${theme.onSurfaceVariant};
                --theme-outline: ${theme.outline};
                --theme-rippleColor: ${theme.rippleColor};
                }
                body {
                  padding-bottom: calc(40px + var(--reader-bottom-inset, 0px));
                }
                #LNReader-chapter p {
                  text-indent: var(--readerSettings-textIndent, 0);
                  margin: var(--readerSettings-paragraphGap, 0px) 0;
                }
                #LNReader-chapter .ln-chapter-name {
                  text-indent: 0;
                  font-weight: 700;
                  font-size: 1.15em;
                  line-height: 1.4;
                  margin: 0 0 1.4em;
                }
                </style>
                <style id="ln-font">
                @font-face {
                  font-family: ${initialReaderSettings.fontFamily};
                  src: url("file:///android_asset/fonts/${
                    initialReaderSettings.fontFamily
                  }.ttf");
                }
				</style>
              <link rel="stylesheet" href="${pluginCustomCSS}">
              <style id="ln-custom-css">${customCSS}</style>
            </head>
            <body class="${
              chapterGeneralSettings.pageReader ? 'page-reader' : ''
            }">
              <div class="transition-chapter" style="transform: ${
                isNextChapterScreenVisible
                  ? 'translateX(-100%)'
                  : 'translateX(0%)'
              };
              ${chapterGeneralSettings.pageReader ? '' : 'display: none'}"
              ">${chapter.name}</div>
              <div id="LNReader-chapter">
                <p class="ln-chapter-name">${chapter.name}</p>
                ${processedHtml}
              </div>
              <div id="reader-ui"></div>
              </body>
              <script>
                var initialPageReaderConfig = ${JSON.stringify({
                  nextChapterScreenVisible: isNextChapterScreenVisible,
                })};


                var initialReaderConfig = ${JSON.stringify({
                  readerSettings: initialReaderSettings,
                  chapterGeneralSettings,
                  novel,
                  chapter,
                  batteryLevel,
                  autoSaveInterval: 2222,
                  DEBUG: __DEV__,
                  strings: {
                    finished:
                      getString('readerScreen.finished') +
                      ': ' +
                      chapter.name.trim(),
                    noNextChapter: getString('readerScreen.noNextChapter'),
                  },
                })}
              </script>
              ${READER_SCRIPTS.map(s => `<script>${s}</script>`).join('\n')}
              <script src="${pluginCustomJS}"></script>
              <script id="ln-custom-js">
              function fn(){
                let html = document.querySelector('#LNReader-chapter').innerHTML;
                ${customJS}
                document.querySelector('#LNReader-chapter').innerHTML = html;
              }
              document.addEventListener('DOMContentLoaded', fn);
              </script>
          </html>
          `,
    };
  }, [
    batteryLevel,
    chapter,
    chapterGeneralSettings,
    processedHtml,
    customJS,
    customCSS,
    initialReaderSettings,
    mountInsets,
    novel,
    plugin,
    pluginCustomCSS,
    pluginCustomJS,
    readerDir,
    theme,
  ]);

  return (
    <>
      <WebView
        ref={webViewRef}
        onTouchStart={onTouchStart}
        style={{ backgroundColor: readerSettings.theme }}
        allowFileAccess={true}
        originWhitelist={['*']}
        scalesPageToFit={true}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled={true}
        webviewDebuggingEnabled={__DEV__}
        onShouldStartLoadWithRequest={({ url }) => {
          if (isPluginIssueReportUrl(url)) {
            void Linking.openURL(url);
            return false;
          }
          if (isChapterRefreshUrl(url)) {
            refetch();
            return false;
          }
          return true;
        }}
        onLoadEnd={() => {
          // One-shot transition flag: consumed by the document that just
          // loaded. Leaving it set makes every later page-mode chapter open
          // with `chapterEndingVisible` true, which blocks `repaginate` from
          // restoring the reading position (chapter opens at the top).
          nextChapterScreenVisible.current = false;
          webViewRef.current?.injectJavaScript(
            `if (window.reader && window.reader.batteryLevel) {
            window.reader.batteryLevel.val = ${lastKnownBatteryLevel};
          }`,
          );
          webViewRef.current?.injectJavaScript(
            adjacentChapterScriptRef.current,
          );

          const searchText = searchTextRef.current.trim();
          if (searchText) {
            webViewRef.current?.injectJavaScript(
              `window.readerSearch?.search(${JSON.stringify(
                searchText,
              )}); true;`,
            );
          }

          if (autoStartTTSRef.current) {
            autoStartTTSRef.current = false;
            setTimeout(() => {
              webViewRef.current?.injectJavaScript(`
              (function() {
                if (window.tts && reader.generalSettings.val.TTSEnable) {
                  setTimeout(() => {
                    tts.start();
                  }, 500);
                }
              })();
            `);
            }, 300);
          }
        }}
        onMessage={(ev: { nativeEvent: { data: string } }) => {
          __DEV__ && onLogMessage(ev);
          const event: WebViewPostEvent = JSON.parse(ev.nativeEvent.data);
          switch (event.type) {
            case 'tts-queue': {
              const payload = event.data as
                | { queue?: unknown; startIndex?: unknown }
                | undefined;
              const queue = Array.isArray(payload?.queue)
                ? payload?.queue.filter(
                    (item): item is string =>
                      typeof item === 'string' && item.trim().length > 0,
                  )
                : [];
              const startIndex =
                typeof payload?.startIndex === 'number'
                  ? payload.startIndex
                  : 0;
              void loadAndPlay(
                queue,
                startIndex,
                {
                  novelName: novel?.name || 'Unknown',
                  chapterName: chapter.name,
                  coverUri: novel?.cover || undefined,
                },
                toNativeTtsSettings(readerSettingsRef.current.tts),
              );
              break;
            }
            case 'tts-command': {
              if (!event.data || typeof event.data !== 'object') {
                break;
              }
              const data = event.data as {
                command?: unknown;
                index?: unknown;
              };
              switch (data.command) {
                case 'next':
                case 'pause':
                case 'play':
                case 'previous':
                case 'replay':
                case 'stop':
                  runTtsCommand(data.command);
                  break;
                case 'seekTo':
                  if (typeof data.index === 'number') {
                    seekTts(data.index);
                  }
                  break;
              }
              break;
            }
            case 'hide':
              onPress();
              break;
            case 'refresh':
              refetch();
              break;
            case 'next':
              nextChapterScreenVisible.current = true;
              if (event.autoStartTTS) {
                autoStartTTSRef.current = true;
              }
              navigateChapter('NEXT');
              break;
            case 'prev':
              if (event.autoStartTTS) {
                autoStartTTSRef.current = true;
              }
              navigateChapter('PREV', {
                openAtEnd:
                  !!event.data &&
                  typeof event.data === 'object' &&
                  (event.data as { openAtEnd?: boolean }).openAtEnd === true,
              });
              break;
            case 'save':
              if (event.data && typeof event.data === 'number') {
                saveProgress(event.data);
                onProgress?.(event.data);
              }
              break;
            case 'text-action':
              eventTextAction(event);
              break;
            case 'search-result':
              if (event.data && typeof event.data === 'object') {
                const data = event.data as {
                  query?: unknown;
                  current?: unknown;
                  total?: unknown;
                  renderedTotal?: unknown;
                  isTruncated?: unknown;
                };
                const query = typeof data.query === 'string' ? data.query : '';
                if (query !== searchTextRef.current.trim()) {
                  break;
                }
                const total = typeof data.total === 'number' ? data.total : 0;
                onSearchResult({
                  query,
                  current: typeof data.current === 'number' ? data.current : 0,
                  total,
                  renderedTotal:
                    typeof data.renderedTotal === 'number'
                      ? data.renderedTotal
                      : total,
                  isTruncated: data.isTruncated === true,
                });
              }
              break;
            case 'interaction':
              onUserInteraction();
              break;
          }
        }}
        source={source}
      />
      <Dialog.Root
        visible={replaceModalVisible}
        onDismiss={() => setReplaceModalVisible(false)}
      >
        <Dialog.Header>
          <Dialog.Title>Replace Text</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <TextInput
            label="Text to replace"
            value={selectedTextForReplace}
            editable={false}
            mode="outlined"
            style={styles.textInput}
            theme={{ colors: { background: theme.surface } }}
          />
          <TextInput
            label="Replace with"
            value={replacementText}
            onChangeText={setReplacementText}
            autoCorrect={false}
            mode="outlined"
            style={styles.textInput}
            theme={{ colors: { background: theme.surface } }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={handleReplaceCancel}>Cancel</Dialog.Action>
          <Dialog.Action onPress={handleReplaceSave}>Save</Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </>
  );
};

const styles = StyleSheet.create({
  textInput: { marginBottom: 16 },
});

export default memo(WebViewReader);
