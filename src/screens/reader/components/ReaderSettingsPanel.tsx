import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import color from 'color';

import { IconButtonV2, Menu } from '@components';
import {
  useChapterGeneralSettings,
  useChapterReaderSettings,
  useTheme,
} from '@hooks/persisted';
import { getString } from '@i18n/translations';
import {
  Font,
  NamedValuePreset,
  nearestPreset,
  presetReaderThemeNames,
  presetReaderThemes,
  readerFonts,
  readerLineSpacingPresets,
  readerMarginPresets,
} from '@utils/constants/readerConstants';
import { ReaderTheme } from '@hooks/persisted/useSettings';
import ReaderSheetPreferenceItem from './ReaderBottomSheet/ReaderSheetPreferenceItem';

const MIN_TEXT_SIZE = 12;
const MAX_TEXT_SIZE = 32;
const CUSTOM_THEME_LABEL = 'Custom';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ReaderSettingsPanelProps {
  visible: boolean;
  onDismiss: () => void;
  /** Opens the full reader settings bottom sheet (everything not shown here). */
  openReaderSheet: () => void;
}

interface DropdownRowProps {
  label: string;
  value: string;
  options: { key: string; label: string; onSelect: () => void }[];
}

const ReaderSettingsPanel: React.FC<ReaderSettingsPanelProps> = ({
  visible,
  onDismiss,
  openReaderSheet,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    theme: backgroundColor,
    textColor,
    textSize,
    fontFamily,
    padding,
    lineHeight,
    customThemes,
    setChapterReaderSettings,
  } = useChapterReaderSettings();
  const {
    removeExtraParagraphSpacing,
    removeTextIndent,
    setChapterGeneralSettings,
  } = useChapterGeneralSettings();

  if (!visible) {
    return null;
  }

  const themeOptions = [...customThemes, ...presetReaderThemes];
  const currentThemeIndex = themeOptions.findIndex(
    t => t.backgroundColor === backgroundColor && t.textColor === textColor,
  );
  const colorLabel =
    currentThemeIndex >= customThemes.length
      ? presetReaderThemeNames[currentThemeIndex - customThemes.length]
      : CUSTOM_THEME_LABEL;

  const fontLabel =
    readerFonts.find(f => f.fontFamily === fontFamily)?.name ??
    readerFonts[0].name;
  const marginLabel = nearestPreset(padding, readerMarginPresets).name;
  const lineSpacingLabel = nearestPreset(
    lineHeight,
    readerLineSpacingPresets,
  ).name;

  const stepTextSize = (delta: number) =>
    setChapterReaderSettings({
      textSize: Math.min(
        MAX_TEXT_SIZE,
        Math.max(MIN_TEXT_SIZE, textSize + delta),
      ),
    });

  return (
    <View style={styles.overlay}>
      <AnimatedPressable
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={styles.backdrop}
        onPress={onDismiss}
      />
      <Animated.View
        entering={SlideInRight.duration(220)}
        exiting={SlideOutRight.duration(180)}
        style={[styles.panel, { paddingTop: insets.top + 12 }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {getString('readerScreen.panel.textSize')}
            </Text>
            <View style={styles.stepper}>
              <IconButtonV2
                name="minus"
                theme={theme}
                disabled={textSize <= MIN_TEXT_SIZE}
                onPress={() => stepTextSize(-1)}
                accessibilityLabel="Decrease text size"
              />
              <Text style={styles.stepperValue}>{textSize}</Text>
              <IconButtonV2
                name="plus"
                theme={theme}
                disabled={textSize >= MAX_TEXT_SIZE}
                onPress={() => stepTextSize(1)}
                accessibilityLabel="Increase text size"
              />
            </View>
          </View>

          <DropdownRow
            label={getString('readerScreen.panel.color')}
            value={colorLabel}
            options={themeOptions.map((t: ReaderTheme, i) => ({
              key: `${t.backgroundColor}_${i}`,
              label:
                i >= customThemes.length
                  ? presetReaderThemeNames[i - customThemes.length]
                  : CUSTOM_THEME_LABEL,
              onSelect: () =>
                setChapterReaderSettings({
                  theme: t.backgroundColor,
                  textColor: t.textColor,
                }),
            }))}
          />

          <DropdownRow
            label={getString('readerScreen.panel.font')}
            value={fontLabel}
            options={readerFonts.map((f: Font) => ({
              key: f.fontFamily || 'original',
              label: f.name,
              onSelect: () =>
                setChapterReaderSettings({ fontFamily: f.fontFamily }),
            }))}
          />

          <DropdownRow
            label={getString('readerScreen.panel.margins')}
            value={marginLabel}
            options={readerMarginPresets.map((p: NamedValuePreset) => ({
              key: p.name,
              label: p.name,
              onSelect: () => setChapterReaderSettings({ padding: p.value }),
            }))}
          />

          <DropdownRow
            label={getString('readerScreen.panel.lineSpacing')}
            value={lineSpacingLabel}
            options={readerLineSpacingPresets.map((p: NamedValuePreset) => ({
              key: p.name,
              label: p.name,
              onSelect: () => setChapterReaderSettings({ lineHeight: p.value }),
            }))}
          />

          <View style={styles.divider} />

          <ReaderSheetPreferenceItem
            label={getString('readerScreen.panel.noLineBreak')}
            value={removeExtraParagraphSpacing}
            onPress={() =>
              setChapterGeneralSettings({
                removeExtraParagraphSpacing: !removeExtraParagraphSpacing,
              })
            }
            theme={theme}
          />
          <ReaderSheetPreferenceItem
            label={getString('readerScreen.panel.noTextIndent')}
            value={removeTextIndent}
            onPress={() =>
              setChapterGeneralSettings({
                removeTextIndent: !removeTextIndent,
              })
            }
            theme={theme}
          />

          <View style={styles.divider} />

          <Pressable
            style={styles.row}
            android_ripple={{ color: theme.rippleColor }}
            onPress={() => {
              onDismiss();
              openReaderSheet();
            }}
          >
            <Text style={styles.rowLabel}>
              {getString('readerScreen.panel.moreSettings')}
            </Text>
            <IconButtonV2
              name="chevron-right"
              theme={theme}
              onPress={() => {
                onDismiss();
                openReaderSheet();
              }}
            />
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const DropdownRowBase: React.FC<DropdownRowProps> = ({
  label,
  value,
  options,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        anchor={
          <Pressable
            style={styles.dropdownAnchor}
            android_ripple={{ color: theme.rippleColor }}
            onPress={() => setOpen(true)}
          >
            <Text style={styles.dropdownValue}>{value}</Text>
            <IconButtonV2
              name={open ? 'menu-up' : 'menu-down'}
              theme={theme}
              size={20}
              padding={2}
              color={theme.onSurfaceVariant}
              onPress={() => setOpen(true)}
            />
          </Pressable>
        }
      >
        {options.map(opt => (
          <Menu.Item
            key={opt.key}
            title={opt.label}
            onPress={() => {
              opt.onSelect();
              setOpen(false);
            }}
          />
        ))}
      </Menu>
    </View>
  );
};

const DropdownRow = React.memo(DropdownRowBase);

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      zIndex: 5,
    },
    backdrop: {
      flex: 1,
      backgroundColor: color(theme.backdrop ?? '#000000')
        .alpha(0.32)
        .string(),
    },
    panel: {
      width: '82%',
      maxWidth: 380,
      backgroundColor: theme.surface,
      borderTopLeftRadius: 12,
      borderBottomLeftRadius: 12,
    },
    content: {
      paddingVertical: 8,
    },
    row: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLabel: {
      color: theme.onSurfaceVariant,
      fontSize: 15,
      flexShrink: 1,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stepperValue: {
      color: theme.onSurface,
      fontSize: 16,
      minWidth: 32,
      textAlign: 'center',
    },
    dropdownAnchor: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dropdownValue: {
      color: theme.onSurface,
      fontSize: 16,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.outlineVariant,
      marginVertical: 6,
      marginHorizontal: 16,
    },
  });

export default ReaderSettingsPanel;
