import { useCallback, useMemo, useState } from 'react';
import { SearchResult, TrackerName, UserListEntry } from '@services/Trackers';
import { TrackerMetadata, getMangaTracker } from './useTracker';
import { getErrorMessage } from '@utils/error';
import { getMMKVObject, setMMKVObject, MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';

/**
 * Manga's `useTrackedNovel.ts` mirror — same MMKV-only design (no DB table
 * for tracker associations exists on either side), own key prefix so a
 * novel and a manga can never collide even if they happened to share an
 * id. Auth itself is shared with the novel side (`useTracker.ts`'s
 * `TRACKERS` MMKV key) — a MAL login is a MAL login regardless of media
 * type — only the tracked-item association and the tracker's underlying
 * query behavior (`getMangaTracker`, not `getTracker`) differ.
 */
export const TRACKED_MANGA_PREFIX = 'TRACKED_MANGA_PREFIX';

type TrackedManga = SearchResult & UserListEntry;

const getTrackerStorageKey = (
  mangaId: number | 'NO_ID',
  trackerName: TrackerName,
) => {
  return `${TRACKED_MANGA_PREFIX}_${mangaId}_${trackerName}`;
};

const TRACKER_NAMES: TrackerName[] = [
  'AniList',
  'MyAnimeList',
  'MangaUpdates',
  'Kitsu',
];

export const useTrackedManga = (mangaId: number | 'NO_ID') => {
  const [trackedManga, setTrackedManga] = useState<
    Partial<Record<TrackerName, TrackedManga>>
  >(() => {
    if (mangaId === 'NO_ID') return {};
    const loaded: Partial<Record<TrackerName, TrackedManga>> = {};
    TRACKER_NAMES.forEach(trackerName => {
      const data = getMMKVObject<TrackedManga>(
        getTrackerStorageKey(mangaId, trackerName),
      );
      if (data) loaded[trackerName] = data;
    });
    return loaded;
  });

  const getTrackedManga = useCallback(
    (trackerName: TrackerName): TrackedManga | undefined =>
      trackedManga[trackerName],
    [trackedManga],
  );

  const isTrackedOn = useCallback(
    (trackerName: TrackerName): boolean => !!trackedManga[trackerName],
    [trackedManga],
  );

  const getTrackedOn = useCallback(
    (): TrackerName[] => Object.keys(trackedManga) as TrackerName[],
    [trackedManga],
  );

  const trackManga = useCallback(
    (tracker: TrackerMetadata, manga: SearchResult) => {
      if (mangaId === 'NO_ID') return Promise.resolve();

      return getMangaTracker(tracker.name)
        .getUserListEntry(manga.id, tracker.auth)
        .then((data: UserListEntry) => {
          const tracked = { ...manga, ...data };
          setMMKVObject(getTrackerStorageKey(mangaId, tracker.name), tracked);
          setTrackedManga(prev => ({ ...prev, [tracker.name]: tracked }));
          return tracked;
        });
    },
    [mangaId],
  );

  const updateTrackedManga = useCallback(
    (tracker: TrackerMetadata, data: Partial<UserListEntry>) => {
      if (mangaId === 'NO_ID') return Promise.resolve();

      const current = trackedManga[tracker.name];
      if (!current) return Promise.resolve();

      return getMangaTracker(tracker.name)
        .updateUserListEntry(current.id, data, tracker.auth)
        .then((res: UserListEntry) => {
          const updated = {
            ...current,
            progress: res.progress,
            score: res.score,
            status: res.status,
          };
          setMMKVObject(getTrackerStorageKey(mangaId, tracker.name), updated);
          setTrackedManga(prev => ({ ...prev, [tracker.name]: updated }));
          return updated;
        });
    },
    [mangaId, trackedManga],
  );

  const untrackManga = useCallback(
    (trackerName: TrackerName) => {
      if (mangaId === 'NO_ID') return;
      MMKVStorage.remove(getTrackerStorageKey(mangaId, trackerName));
      setTrackedManga(prev => {
        const next = { ...prev };
        delete next[trackerName];
        return next;
      });
    },
    [mangaId],
  );

  /**
   * Updates tracking information across all authenticated trackers
   * currently tracking this manga. Updates run in parallel — mirrors
   * `useTrackedNovel.ts`'s `updateAllTrackedNovels`, the trigger point
   * novel's reader calls once a chapter crosses its "read" threshold.
   * Manga has no scroll-percentage concept, so the caller (`MangaChapterScreen.tsx`)
   * calls this directly on a successful chapter load/advance instead.
   */
  const updateAllTrackedManga = useCallback(
    async (data: Partial<UserListEntry>) => {
      if (mangaId === 'NO_ID') return;

      const trackersToUpdate = Object.keys(trackedManga) as TrackerName[];
      if (trackersToUpdate.length === 0) return;

      const authenticatedTrackers =
        getMMKVObject<Partial<Record<TrackerName, TrackerMetadata>>>(
          'TRACKERS',
        );

      const updatePromises = trackersToUpdate
        .filter(trackerName => authenticatedTrackers?.[trackerName])
        .map(async trackerName => {
          const current = trackedManga[trackerName];
          const tracker = authenticatedTrackers![trackerName];
          if (!current || !tracker) return;

          try {
            const res = await getMangaTracker(trackerName).updateUserListEntry(
              current.id,
              data,
              tracker.auth,
            );
            const updated = {
              ...current,
              progress: res.progress,
              score: res.score,
              status: res.status,
            };
            setMMKVObject(getTrackerStorageKey(mangaId, trackerName), updated);
            setTrackedManga(prev => ({ ...prev, [trackerName]: updated }));
          } catch (error) {
            showToast(
              `Failed to update ${trackerName}: ${getErrorMessage(error)}`,
            );
          }
        });

      await Promise.all(updatePromises);
    },
    [mangaId, trackedManga],
  );

  const primaryTrackedManga = useMemo(
    () => Object.values(trackedManga)[0],
    [trackedManga],
  );

  if (mangaId === 'NO_ID') {
    return {
      trackedManga: {},
      primaryTrackedManga: undefined,
      trackManga: () => Promise.resolve(),
      untrackManga: () => {},
      updateTrackedManga: () => Promise.resolve(),
      getTrackedManga: () => undefined,
      isTrackedOn: () => false,
      getTrackedOn: () => [],
      updateAllTrackedManga: () => Promise.resolve(),
    };
  }

  return {
    trackedManga,
    primaryTrackedManga,
    trackManga,
    untrackManga,
    updateTrackedManga,
    getTrackedManga,
    isTrackedOn,
    getTrackedOn,
    updateAllTrackedManga,
  };
};
