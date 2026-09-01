import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Tts,
  TtsMetadata,
  TtsParagraph,
  TtsPlaybackState,
  TtsProgress,
  TtsSession,
  TtsSettings,
} from '@modules/nitro-tts';
import { ChapterInfo, NovelInfo } from '@database/types';
import { extractChapterParagraphs } from '@services/tts/chapterParagraphs';

type TtsCommand = 'next' | 'pause' | 'play' | 'previous' | 'replay' | 'stop';

/** Chapters to keep buffered ahead of the paragraph being spoken. */
const BUFFER_CHAPTERS_AHEAD = 2;

/** Bare paragraph as produced by the WebView for the visible chapter. */
export interface QueueParagraph {
  id: string;
  text: string;
}

/**
 * Everything the session needs to keep narrating past the current chapter and
 * to move the reader UI along with it.
 */
export interface TtsSessionContext {
  novel: NovelInfo;
  chapter: ChapterInfo;
  /** The chapter after `afterChapterId` in reading order, or undefined at the end. */
  getChapterAfter(afterChapterId: string): Promise<ChapterInfo | undefined>;
  /** Narration crossed into this chapter — follow it in the reader. */
  onChapterCrossed(chapterId: string): void;
}

const initialProgress: TtsProgress = {
  index: 0,
  total: 0,
  paragraphId: '',
  chapterId: '',
};

export const useTtsSession = () => {
  const sessionRef = useRef<TtsSession | null>(null);
  const sessionPromiseRef = useRef<Promise<TtsSession> | null>(null);
  const subscriptionsRef = useRef<{ remove(): void }[]>([]);
  const mountedRef = useRef(true);
  const [state, setState] = useState<TtsPlaybackState>('idle');
  const [progress, setProgress] = useState<TtsProgress>(initialProgress);
  const [error, setError] = useState<string | null>(null);

  // Continuous cross-chapter playback bookkeeping.
  const ctxRef = useRef<TtsSessionContext | null>(null);
  const queuedChapterIdsRef = useRef<string[]>([]);
  const uiChapterIdRef = useRef<string>('');
  const topUpInFlightRef = useRef(false);
  const endOfNovelRef = useRef(false);
  // Full text of every queued paragraph, so the player can caption the one
  // being spoken (`progress.paragraphId` → text). Also the chapter name per id.
  const paragraphTextRef = useRef<Map<string, string>>(new Map());
  const chapterNameByIdRef = useRef<Map<string, string>>(new Map());

  const rememberParagraphs = useCallback((tagged: TtsParagraph[]) => {
    for (const p of tagged) {
      paragraphTextRef.current.set(p.id, p.text);
      if (p.chapterName) {
        chapterNameByIdRef.current.set(p.chapterId, p.chapterName);
      }
    }
  }, []);

  const resetContinuity = useCallback(() => {
    ctxRef.current = null;
    queuedChapterIdsRef.current = [];
    uiChapterIdRef.current = '';
    topUpInFlightRef.current = false;
    endOfNovelRef.current = false;
    paragraphTextRef.current = new Map();
    chapterNameByIdRef.current = new Map();
  }, []);

  /** Fetch the chapter after the last queued one and append it natively. */
  const topUp = useCallback(async () => {
    if (topUpInFlightRef.current || endOfNovelRef.current) {
      return;
    }
    const ctx = ctxRef.current;
    const session = sessionRef.current;
    if (!ctx || !session) {
      return;
    }
    const queued = queuedChapterIdsRef.current;
    const lastId = queued[queued.length - 1];
    if (!lastId) {
      return;
    }
    topUpInFlightRef.current = true;
    try {
      const next = await ctx.getChapterAfter(lastId);
      if (!next) {
        endOfNovelRef.current = true;
        return;
      }
      const paras = await extractChapterParagraphs(
        ctx.novel.pluginId,
        ctx.novel.name,
        next,
      );
      if (paras.length === 0) {
        endOfNovelRef.current = true;
        return;
      }
      const tagged: TtsParagraph[] = paras.map(p => ({
        ...p,
        chapterId: String(next.id),
        chapterName: next.name,
      }));
      rememberParagraphs(tagged);
      await session.appendParagraphs(tagged);
      queuedChapterIdsRef.current = [...queued, String(next.id)];
    } catch {
      // Leave it — native plays what it has and completes at that boundary.
    } finally {
      topUpInFlightRef.current = false;
    }
  }, [rememberParagraphs]);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current;
    }
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = Tts.createSession()
        .then(session => {
          if (!mountedRef.current) {
            void session.stop();
            return session;
          }
          sessionRef.current = session;
          subscriptionsRef.current = [
            session.addOnStateChangedListener(setState),
            session.addOnProgressChangedListener(nextProgress => {
              setProgress(nextProgress);
              const crossedInto = nextProgress.chapterId;
              if (crossedInto && crossedInto !== uiChapterIdRef.current) {
                uiChapterIdRef.current = crossedInto;
                ctxRef.current?.onChapterCrossed(crossedInto);
              }
            }),
            session.addOnErrorListener(setError),
            session.addOnQueueLowListener(() => {
              void topUp();
            }),
          ];
          return session;
        })
        .catch(cause => {
          sessionPromiseRef.current = null;
          throw cause;
        });
    }
    return sessionPromiseRef.current;
  }, [topUp]);

  const run = useCallback(
    async (operation: (session: TtsSession) => Promise<void>) => {
      try {
        setError(null);
        await operation(await ensureSession());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [ensureSession],
  );

  const loadAndPlay = useCallback(
    async (
      paragraphs: QueueParagraph[],
      startIndex: number,
      metadata: TtsMetadata,
      settings: TtsSettings,
      chapterId?: string,
      ctx?: TtsSessionContext,
    ) => {
      if (paragraphs.length === 0) {
        setError('No readable paragraphs were found in this chapter.');
        return;
      }
      const resolvedChapterId = chapterId ?? '';
      // A one-off (e.g. the settings preview) has no chapter context and no
      // cross-chapter buffering.
      const continuous = !!(chapterId && ctx);
      resetContinuity();
      if (continuous) {
        ctxRef.current = ctx!;
        queuedChapterIdsRef.current = [resolvedChapterId];
        uiChapterIdRef.current = resolvedChapterId;
      }

      const tagged: TtsParagraph[] = paragraphs.map(p => ({
        ...p,
        chapterId: resolvedChapterId,
        chapterName: ctx?.chapter.name ?? metadata.chapterName,
      }));
      rememberParagraphs(tagged);

      await run(async session => {
        await session.load(tagged, startIndex, metadata, settings);
        await session.play();
      });

      if (continuous) {
        // Buffer a couple of chapters ahead so lock-screen playback survives
        // the next boundaries without the (frozen) WebView.
        void (async () => {
          for (let i = 0; i < BUFFER_CHAPTERS_AHEAD; i++) {
            await topUp();
          }
        })();
      }
    },
    [rememberParagraphs, resetContinuity, run, topUp],
  );

  const command = useCallback(
    (nextCommand: TtsCommand) => {
      if (nextCommand === 'stop') {
        resetContinuity();
      }
      void run(session => {
        switch (nextCommand) {
          case 'next':
            return session.skipNext();
          case 'pause':
            return session.pause();
          case 'play':
            return session.play();
          case 'previous':
            return session.skipPrevious();
          case 'replay':
            return session.replayCurrent();
          case 'stop':
            return session.stop();
        }
      });
    },
    [resetContinuity, run],
  );

  const seekTo = useCallback(
    (index: number) => {
      void run(session => session.seekTo(index));
    },
    [run],
  );

  const updateSettings = useCallback(
    (settings: TtsSettings) => {
      if (sessionRef.current) {
        void run(session => session.updateSettings(settings));
      }
    },
    [run],
  );

  useEffect(() => {
    void ensureSession().catch(cause => {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      mountedRef.current = false;
      subscriptionsRef.current.forEach(subscription => subscription.remove());
      subscriptionsRef.current = [];
      // Deliberately do NOT stop the native session here — narration continues
      // while the user leaves the reader / navigates the app (and via the
      // lock-screen controls). It only stops on an explicit `command('stop')`.
      sessionRef.current = null;
      sessionPromiseRef.current = null;
    };
  }, [ensureSession]);

  // Text of the paragraph being spoken + which chapter it's in — for the
  // player. Lookup tables keyed by the current `progress` (real state), so a
  // ref read here is safe.
  /* eslint-disable react-hooks/refs */
  const currentText = progress.paragraphId
    ? paragraphTextRef.current.get(progress.paragraphId) ?? ''
    : '';
  const currentChapterName = progress.chapterId
    ? chapterNameByIdRef.current.get(progress.chapterId) ?? ''
    : '';
  /* eslint-enable react-hooks/refs */

  return {
    command,
    error,
    loadAndPlay,
    progress,
    seekTo,
    state,
    updateSettings,
    currentText,
    currentChapterName,
  };
};
