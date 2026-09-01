import type { HybridObject } from 'react-native-nitro-modules';
import type { ListenerSubscription } from '../types/ListenerSubscription';
import type { TtsMetadata } from '../types/TtsMetadata';
import type { TtsParagraph } from '../types/TtsParagraph';
import type { TtsPlaybackState } from '../types/TtsPlaybackState';
import type { TtsProgress } from '../types/TtsProgress';
import type { TtsSettings } from '../types/TtsSettings';

/**
 * Controls one native text-to-speech queue and its media controls.
 *
 * @see {@linkcode TtsSession.load}
 */
export interface TtsSession
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Replaces the active paragraph queue and resolves after native preparation.
   */
  load(
    paragraphs: TtsParagraph[],
    initialIndex: number,
    metadata: TtsMetadata,
    settings: TtsSettings,
  ): Promise<void>;

  /**
   * Appends paragraphs to the end of the active queue so playback continues
   * past the current chapter without JS. Revives a queue that had already
   * finished. No-op when nothing is loaded.
   */
  appendParagraphs(paragraphs: TtsParagraph[]): Promise<void>;

  /** Starts or resumes playback. */
  play(): Promise<void>;

  /** Pauses playback while preserving the active paragraph. */
  pause(): Promise<void>;

  /** Stops playback and clears the active queue. */
  stop(): Promise<void>;

  /** Starts the paragraph before the active paragraph. */
  skipPrevious(): Promise<void>;

  /** Starts the paragraph after the active paragraph. */
  skipNext(): Promise<void>;

  /** Restarts the active paragraph from its beginning. */
  replayCurrent(): Promise<void>;

  /** Starts the paragraph at `index`. */
  seekTo(index: number): Promise<void>;

  /** Applies voice, rate, and pitch preferences. */
  updateSettings(settings: TtsSettings): Promise<void>;

  /**
   * Observes playback-state changes.
   */
  addOnStateChangedListener(
    listener: (state: TtsPlaybackState) => void,
  ): ListenerSubscription;

  /**
   * Observes active-paragraph changes.
   */
  addOnProgressChangedListener(
    listener: (progress: TtsProgress) => void,
  ): ListenerSubscription;

  /**
   * Observes native playback failures.
   */
  addOnErrorListener(listener: (message: string) => void): ListenerSubscription;

  /**
   * Fires when the tail of the queue is running short, so JS can fetch the
   * next chapter and {@linkcode TtsSession.appendParagraphs}. `remaining` is
   * the number of paragraphs left after the active one.
   */
  addOnQueueLowListener(
    listener: (remaining: number) => void,
  ): ListenerSubscription;
}
