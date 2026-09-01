import { useEffect, useRef } from 'react';

export type SleepMode = 'off' | '10' | '20' | '30' | '45' | '60' | 'chapter';

export const SLEEP_MODES: { value: SleepMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '10', label: '10 minutes' },
  { value: '20', label: '20 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: 'chapter', label: 'End of chapter' },
];

interface Options {
  mode: SleepMode;
  /** Current chapter id — a change fires the `'chapter'` timer. */
  chapterId: string;
  /** Called when the timer elapses (pause narration). */
  onFire: () => void;
}

/**
 * Pauses narration after the chosen delay, or at the next chapter boundary for
 * `'chapter'`. Session-only — resets whenever `mode` changes.
 */
export const useSleepTimer = ({ mode, chapterId, onFire }: Options) => {
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  }, [onFire]);

  // Minute countdowns.
  useEffect(() => {
    const minutes = Number(mode);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }
    const id = setTimeout(() => onFireRef.current(), minutes * 60_000);
    return () => clearTimeout(id);
  }, [mode]);

  // End-of-chapter: fire on the first chapter change after arming.
  const armedChapterRef = useRef<string | null>(null);
  useEffect(() => {
    armedChapterRef.current = mode === 'chapter' ? chapterId : null;
    // Only re-arm when the mode changes, not on every chapter crossing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => {
    if (
      mode === 'chapter' &&
      armedChapterRef.current &&
      armedChapterRef.current !== chapterId
    ) {
      armedChapterRef.current = null;
      onFireRef.current();
    }
  }, [mode, chapterId]);
};
