/**
 * One independently navigable paragraph in a TTS queue.
 *
 * @see {@linkcode TtsSession.load}
 */
export interface TtsParagraph {
  /** Stable key used to synchronize native progress with the WebView DOM. */
  id: string;
  /** Text sent to the selected native speech voice. */
  text: string;
  /**
   * Id of the chapter this paragraph belongs to. Lets one native queue span
   * several chapters so playback continues across chapter boundaries without
   * the (background-frozen) WebView.
   */
  chapterId: string;
  /** Chapter title, shown on the lock-screen / media controls at a crossing. */
  chapterName: string;
}
