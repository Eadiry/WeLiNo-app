import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appbar as PaperAppbar } from 'react-native-paper';
import { ThemeColors } from '../../theme/types';

interface AppbarProps {
  title: string;
  handleGoBack?: () => void;
  theme: ThemeColors;
  mode?: 'small' | 'medium' | 'large' | 'center-aligned';
  children?: React.ReactNode;
}

const Appbar: React.FC<AppbarProps> = ({
  title,
  handleGoBack,
  theme,
  mode = 'large',
  children,
}) => {
  const insets = useSafeAreaInsets();
  // `StatusBar.currentHeight` is Android-only (undefined on iOS), which drops
  // the header under the notch / Dynamic Island and makes the back button
  // hard to reach. Use the safe-area top inset on iOS.
  const statusBarHeight =
    Platform.OS === 'android' ? StatusBar.currentHeight : insets.top;

  return (
    <PaperAppbar.Header
      style={{ backgroundColor: theme.surface }}
      statusBarHeight={statusBarHeight}
      mode={mode}
    >
      {handleGoBack && (
        <PaperAppbar.BackAction
          onPress={handleGoBack}
          iconColor={theme.onSurface}
        />
      )}
      <PaperAppbar.Content
        title={title}
        titleStyle={{ color: theme.onSurface }}
      />
      {children}
    </PaperAppbar.Header>
  );
};

export default Appbar;
