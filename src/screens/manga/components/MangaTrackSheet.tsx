import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, ToastAndroid, View } from 'react-native';
import { Portal } from 'react-native-paper';

import BottomSheet from '@components/BottomSheet/BottomSheet';
import { useTracker } from '@hooks/persisted';
import { useTrackedManga } from '@hooks/persisted/useTrackedManga';
import { getMangaTracker, TrackerMetadata } from '@hooks/persisted/useTracker';
import { TrackerName, UserListStatus } from '@services/Trackers';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import {
  AddTrackingCard,
  TrackedItemCard,
  TrackSearchDialog,
  SetTrackStatusDialog,
  SetTrackScoreDialog,
  SetTrackChaptersDialog,
  getStatusLabel,
  getTrackerIcon,
} from '@screens/novel/components/Tracker';

/**
 * Manga's `TrackSheet.tsx` mirror — same bottom sheet + 4 dialogs, all of
 * which (besides `TrackSearchDialog`) were already fully content-agnostic.
 * `TrackSearchDialog` gained an optional `getTracker` prop specifically for
 * this: passing `getMangaTracker` instead of the novel-default `getTracker`
 * makes its search query manga/manhwa/manhua instead of light novels — see
 * each tracker's `create*Tracker` factory in `services/Trackers/`.
 */
interface MangaTrackSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModalMethods | null>;
  mangaId: number;
  mangaName: string;
}

const MangaTrackSheet: React.FC<MangaTrackSheetProps> = ({
  bottomSheetRef,
  mangaId,
  mangaName,
}) => {
  const { getAuthenticatedTrackers } = useTracker();
  const {
    getTrackedManga,
    isTrackedOn,
    trackManga,
    untrackManga,
    updateTrackedManga,
  } = useTrackedManga(mangaId);

  const authenticatedTrackers = getAuthenticatedTrackers();

  const [activeTracker, setActiveTracker] = useState<TrackerMetadata | null>(
    null,
  );
  const [trackSearchDialog, setTrackSearchDialog] = useState(false);
  const [trackStatusDialog, setTrackStatusDialog] = useState(false);
  const [trackChaptersDialog, setTrackChaptersDialog] = useState(false);
  const [trackScoreDialog, setTrackScoreDialog] = useState(false);

  const closeBottomSheet = useCallback(() => {
    bottomSheetRef.current?.close();
  }, [bottomSheetRef]);

  const handleSetSearchTrackDialog = useCallback(
    (tracker: TrackerMetadata) => {
      closeBottomSheet();
      setActiveTracker(tracker);
      setTrackSearchDialog(true);
    },
    [closeBottomSheet],
  );

  const handleSetStatusDialog = useCallback(
    (tracker: TrackerMetadata) => {
      setActiveTracker(tracker);
      closeBottomSheet();
      setTrackStatusDialog(true);
    },
    [closeBottomSheet],
  );

  const handleSetChaptersDialog = useCallback(
    (tracker: TrackerMetadata) => {
      setActiveTracker(tracker);
      closeBottomSheet();
      setTrackChaptersDialog(true);
    },
    [closeBottomSheet],
  );

  const handleSetScoreDialog = useCallback(
    (tracker: TrackerMetadata) => {
      setActiveTracker(tracker);
      closeBottomSheet();
      setTrackScoreDialog(true);
    },
    [closeBottomSheet],
  );

  const handleDismissSearchDialog = useCallback(() => {
    setTrackSearchDialog(false);
    setActiveTracker(null);
  }, []);

  const handleDismissStatusDialog = useCallback(() => {
    setTrackStatusDialog(false);
    setActiveTracker(null);
  }, []);

  const handleDismissChaptersDialog = useCallback(() => {
    setTrackChaptersDialog(false);
    setActiveTracker(null);
  }, []);

  const handleDismissScoreDialog = useCallback(() => {
    setTrackScoreDialog(false);
    setActiveTracker(null);
  }, []);

  const updateTrackChapters = useCallback(
    (newChapters: string) => {
      if (!activeTracker) return;

      if (!newChapters) {
        ToastAndroid.show('Enter a valid number', ToastAndroid.SHORT);
        return;
      }

      const newProgress = Number(newChapters);
      if (isNaN(newProgress)) {
        ToastAndroid.show('Enter a valid number', ToastAndroid.SHORT);
        return;
      }

      updateTrackedManga(activeTracker, { progress: newProgress });
    },
    [activeTracker, updateTrackedManga],
  );

  const updateTrackStatus = useCallback(
    (newStatus: UserListStatus) => {
      if (!activeTracker) return;
      updateTrackedManga(activeTracker, { status: newStatus });
    },
    [activeTracker, updateTrackedManga],
  );

  const updateTrackScore = useCallback(
    (newScore: number) => {
      if (!activeTracker) return;
      updateTrackedManga(activeTracker, { score: newScore });
    },
    [activeTracker, updateTrackedManga],
  );

  const handleUntrack = useCallback(
    (trackerName: TrackerName) => {
      untrackManga(trackerName);
    },
    [untrackManga],
  );

  const snapPoints = useMemo(() => {
    const trackerCount = authenticatedTrackers.length;
    if (trackerCount === 0) return [130];

    const hasAnyTracked = authenticatedTrackers.some(t => isTrackedOn(t.name));
    const cardHeight = hasAnyTracked ? 180 : 130;
    const totalHeight = 50 + trackerCount * cardHeight;

    return [Math.min(totalHeight, 600)];
  }, [authenticatedTrackers, isTrackedOn]);
  const activeTrackedManga = activeTracker
    ? getTrackedManga(activeTracker.name)
    : undefined;

  if (authenticatedTrackers.length === 0) {
    return null;
  }

  return (
    <>
      <BottomSheet bottomSheetRef={bottomSheetRef} snapPoints={snapPoints}>
        <ScrollView style={styles.contentContainer}>
          {authenticatedTrackers.map(tracker => {
            const trackerIcon = getTrackerIcon(tracker.name);
            const trackedManga = getTrackedManga(tracker.name);

            if (!trackerIcon) return null;

            return (
              <View key={tracker.name} style={styles.trackerCardContainer}>
                {!trackedManga ? (
                  <AddTrackingCard
                    icon={trackerIcon}
                    onPress={() => handleSetSearchTrackDialog(tracker)}
                  />
                ) : (
                  <TrackedItemCard
                    onUntrack={() => handleUntrack(tracker.name)}
                    tracker={tracker}
                    icon={trackerIcon}
                    trackItem={trackedManga}
                    onSetStatus={() => handleSetStatusDialog(tracker)}
                    onSetChapters={() => handleSetChaptersDialog(tracker)}
                    onSetScore={() => handleSetScoreDialog(tracker)}
                    getStatus={getStatusLabel}
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      </BottomSheet>
      <Portal>
        {activeTracker ? (
          <>
            {activeTrackedManga ? (
              <>
                {trackStatusDialog ? (
                  <SetTrackStatusDialog
                    tracker={activeTracker}
                    trackItem={activeTrackedManga}
                    visible
                    onDismiss={handleDismissStatusDialog}
                    onUpdateStatus={updateTrackStatus}
                  />
                ) : null}
                {trackChaptersDialog ? (
                  <SetTrackChaptersDialog
                    tracker={activeTracker}
                    trackItem={activeTrackedManga}
                    visible
                    onDismiss={handleDismissChaptersDialog}
                    onUpdateChapters={updateTrackChapters}
                  />
                ) : null}
                {trackScoreDialog ? (
                  <SetTrackScoreDialog
                    tracker={activeTracker}
                    trackItem={activeTrackedManga}
                    visible
                    onDismiss={handleDismissScoreDialog}
                    onUpdateScore={updateTrackScore}
                  />
                ) : null}
              </>
            ) : trackSearchDialog ? (
              <TrackSearchDialog
                tracker={activeTracker}
                onTrackNovel={trackManga}
                visible
                onDismiss={handleDismissSearchDialog}
                novelName={mangaName}
                getTracker={getMangaTracker}
              />
            ) : null}
          </>
        ) : null}
      </Portal>
    </>
  );
};

export default MangaTrackSheet;

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  trackerCardContainer: {
    marginBottom: 8,
  },
});
