/**
 * Imperative handle every manga reader component exposes so the chapter
 * screen's bottom seekbar can jump to an arbitrary page — each mode reaches
 * a different underlying widget (`react-native-pager-view` vs. `LegendList`),
 * so the shared shape is just "go to this page index".
 */
export interface MangaReaderHandle {
  goToPage: (index: number) => void;
}
