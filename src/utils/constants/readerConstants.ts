import { ReaderTheme } from '@hooks/persisted/useSettings';

export const presetReaderThemes: ReaderTheme[] = [
  { backgroundColor: '#f5f5fa', textColor: '#111111' },
  { backgroundColor: '#F7DFC6', textColor: '#593100' },
  { backgroundColor: '#dce5e2', textColor: '#000000' },
  { backgroundColor: '#292832', textColor: '#CCCCCC' },
  {
    backgroundColor: '#000000',
    textColor: '#FFFFFFB3',
  },
];

/** Display names for `presetReaderThemes`, in the same order. */
export const presetReaderThemeNames = [
  'Paper',
  'Sepia',
  'Mint',
  'Charcoal',
  'Black',
];

export interface NamedValuePreset {
  name: string;
  value: number;
}

/** Reader side padding, surfaced as named steps in the settings panel. */
export const readerMarginPresets: NamedValuePreset[] = [
  { name: 'Narrow', value: 8 },
  { name: 'Medium', value: 16 },
  { name: 'Wide', value: 32 },
  { name: 'Wider', value: 48 },
];

/** Reader line height, surfaced as named steps in the settings panel. */
export const readerLineSpacingPresets: NamedValuePreset[] = [
  { name: 'Tight', value: 1.3 },
  { name: 'Normal', value: 1.5 },
  { name: 'Relaxed', value: 1.8 },
  { name: 'Loose', value: 2.1 },
];

/** Closest preset to `value` — for labelling a control whose stored value is a raw number. */
export const nearestPreset = (
  value: number,
  presets: NamedValuePreset[],
): NamedValuePreset =>
  presets.reduce((best, p) =>
    Math.abs(p.value - value) < Math.abs(best.value - value) ? p : best,
  );

export interface Font {
  fontFamily: string;
  name: string;
}

export const readerFonts: Font[] = [
  { fontFamily: '', name: 'Original' },
  { fontFamily: 'lora', name: 'Lora' },
  { fontFamily: 'nunito', name: 'Nunito' },
  { fontFamily: 'noto-sans', name: 'Noto Sans' },
  { fontFamily: 'open-sans', name: 'Open Sans' },
  { fontFamily: 'arbutus-slab', name: 'Arbutus Slab' },
  { fontFamily: 'domine', name: 'Domine' },
  { fontFamily: 'lato', name: 'Lato' },
  { fontFamily: 'pt-serif', name: 'PT Serif' },
  { fontFamily: 'OpenDyslexic3-Regular', name: 'OpenDyslexic' },
];
