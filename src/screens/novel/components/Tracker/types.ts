import { ImageSourcePropType } from 'react-native';

import {
  SearchResult,
  Tracker,
  TrackerName,
  UserListEntry,
  UserListStatus,
} from '@services/Trackers';
import { TrackerMetadata } from '@hooks/persisted/useTracker';

export type TrackedNovel = SearchResult & UserListEntry;

export interface BaseDialogProps {
  visible: boolean;
  onDismiss: () => void;
}

export interface TrackStatusDialogProps extends BaseDialogProps {
  tracker: TrackerMetadata;
  trackItem: TrackedNovel;
  onUpdateStatus: (status: UserListStatus) => void;
}

export interface TrackChaptersDialogProps extends BaseDialogProps {
  tracker: TrackerMetadata;
  trackItem: TrackedNovel;
  onUpdateChapters: (chapters: string) => void;
}

export interface TrackScoreDialogProps extends BaseDialogProps {
  tracker: TrackerMetadata;
  trackItem: TrackedNovel;
  onUpdateScore: (score: number) => void;
}

export interface TrackSearchDialogProps extends BaseDialogProps {
  tracker: TrackerMetadata;
  novelName: string;
  onTrackNovel: (tracker: TrackerMetadata, novel: SearchResult) => void;
  /** Resolves which tracker configuration to search with — defaults to
   * the novel-configured trackers (`getTracker` from `useTracker.ts`).
   * Manga's `MangaTrackSheet` passes `getMangaTracker` instead so search
   * queries manga/manhwa/manhua rather than light novels. */
  getTracker?: (name: TrackerName) => Tracker;
}

export interface AddTrackingCardProps {
  icon: ImageSourcePropType;
  onPress: () => void;
}

export interface TrackedItemCardProps {
  icon: ImageSourcePropType;
  tracker: TrackerMetadata;
  trackItem: TrackedNovel;
  onUntrack: () => void;
  onSetStatus: () => void;
  onSetChapters: () => void;
  onSetScore: () => void;
  getStatus: (status: string) => string | undefined;
}

export interface ScoreSelectorProps {
  trackItem: TrackedNovel;
  onUpdateScore: (score: number) => void;
}

export interface AniListScoreSelectorProps extends ScoreSelectorProps {
  scoreFormat: string;
}

export type ScoreFormat =
  | 'POINT_100'
  | 'POINT_10_DECIMAL'
  | 'POINT_10'
  | 'POINT_5'
  | 'POINT_3';

export interface ScoreFormatting {
  count: number;
  label: (score: number) => string;
}
