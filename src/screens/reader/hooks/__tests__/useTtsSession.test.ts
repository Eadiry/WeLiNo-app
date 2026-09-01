import { act, renderHook, waitFor } from '@testing-library/react-native';

import { Tts, type TtsSession } from '@modules/nitro-tts';
import { ChapterInfo, NovelInfo } from '@database/types';
import { extractChapterParagraphs } from '@services/tts/chapterParagraphs';
import { useTtsSession } from '../useTtsSession';

// Keeps `sanitize-html` / `cheerio` out of this hook test's module graph.
jest.mock('@services/tts/chapterParagraphs', () => ({
  extractChapterParagraphs: jest.fn(async () => []),
}));

const mockExtract = extractChapterParagraphs as jest.Mock;

const getNativeSession = async (): Promise<jest.Mocked<TtsSession>> => {
  const createSession = Tts.createSession as jest.Mock;
  await waitFor(() => expect(createSession).toHaveBeenCalled());
  return createSession.mock.results[0].value as Promise<
    jest.Mocked<TtsSession>
  >;
};

describe('useTtsSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the paragraph queue before playing it', async () => {
    const { result } = renderHook(useTtsSession);
    const session = await getNativeSession();

    await act(async () => {
      await result.current.loadAndPlay(
        [
          { id: '0', text: 'First paragraph' },
          { id: '1', text: 'Second paragraph' },
        ],
        1,
        {
          novelName: 'Novel',
          chapterName: 'Chapter',
        },
        {
          rate: 1.2,
          pitch: 0.9,
        },
      );
    });

    expect(session.load).toHaveBeenCalledWith(
      [
        {
          id: '0',
          text: 'First paragraph',
          chapterId: '',
          chapterName: 'Chapter',
        },
        {
          id: '1',
          text: 'Second paragraph',
          chapterId: '',
          chapterName: 'Chapter',
        },
      ],
      1,
      {
        novelName: 'Novel',
        chapterName: 'Chapter',
      },
      {
        rate: 1.2,
        pitch: 0.9,
      },
    );
    expect(session.play).toHaveBeenCalledTimes(1);
    expect(session.load.mock.invocationCallOrder[0]).toBeLessThan(
      session.play.mock.invocationCallOrder[0],
    );
  });

  it('maps reader controls to native paragraph commands', async () => {
    const { result } = renderHook(useTtsSession);
    const session = await getNativeSession();

    act(() => {
      result.current.command('previous');
      result.current.command('pause');
      result.current.command('next');
      result.current.seekTo(3);
    });

    await waitFor(() => {
      expect(session.skipPrevious).toHaveBeenCalledTimes(1);
      expect(session.pause).toHaveBeenCalledTimes(1);
      expect(session.skipNext).toHaveBeenCalledTimes(1);
      expect(session.seekTo).toHaveBeenCalledWith(3);
    });
  });

  it('appends the next chapter when the native queue runs low', async () => {
    const { result } = renderHook(useTtsSession);
    const session = await getNativeSession();

    const nextChapter = { id: 6, name: 'Chapter 6' } as ChapterInfo;
    const getChapterAfter = jest
      .fn<Promise<ChapterInfo | undefined>, [string]>()
      .mockResolvedValueOnce(nextChapter)
      .mockResolvedValue(undefined);
    mockExtract.mockResolvedValue([{ id: '6:0', text: 'Sixth chapter' }]);

    await act(async () => {
      await result.current.loadAndPlay(
        [{ id: '5:0', text: 'Fifth chapter' }],
        0,
        { novelName: 'Novel', chapterName: 'Chapter 5' },
        { rate: 1, pitch: 1 },
        '5',
        {
          novel: { pluginId: 'p', name: 'Novel' } as NovelInfo,
          chapter: { id: 5, name: 'Chapter 5' } as ChapterInfo,
          getChapterAfter,
          onChapterCrossed: jest.fn(),
        },
      );
    });

    // Fire the "queue low" callback the hook registered with the session.
    const queueLowListener = session.addOnQueueLowListener.mock.calls[0][0];
    await act(async () => {
      queueLowListener(4);
    });

    await waitFor(() => {
      expect(session.appendParagraphs).toHaveBeenCalledWith([
        {
          id: '6:0',
          text: 'Sixth chapter',
          chapterId: '6',
          chapterName: 'Chapter 6',
        },
      ]);
    });
  });

  it('removes listeners but keeps narration going on unmount', async () => {
    const { unmount } = renderHook(useTtsSession);
    const session = await getNativeSession();
    await waitFor(() =>
      expect(session.addOnErrorListener).toHaveBeenCalledTimes(1),
    );

    const subscriptions = [
      session.addOnStateChangedListener.mock.results[0].value,
      session.addOnProgressChangedListener.mock.results[0].value,
      session.addOnErrorListener.mock.results[0].value,
    ];
    unmount();

    await waitFor(() => {
      subscriptions.forEach(item => {
        expect(item.remove).toHaveBeenCalled();
      });
    });
    // Leaving the reader must NOT stop playback — it continues app-wide / on
    // the lock screen until an explicit stop.
    expect(session.stop).not.toHaveBeenCalled();
  });
});
