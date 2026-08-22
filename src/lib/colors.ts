/** Note colour palette. The key is persisted per note in the `color` column. */

export interface NoteColor {
  key: string;
  label: string;
  swatch: string;
  dark: boolean;
}

export const NOTE_COLORS: NoteColor[] = [
  { key: 'yellow', label: 'Yellow', swatch: '#fff9c4', dark: false },
  { key: 'amber', label: 'Amber', swatch: '#ffe0b2', dark: false },
  { key: 'pink', label: 'Pink', swatch: '#f8bbd9', dark: false },
  { key: 'blue', label: 'Blue', swatch: '#bbdefb', dark: false },
  { key: 'green', label: 'Green', swatch: '#c8e6c9', dark: false },
  { key: 'purple', label: 'Purple', swatch: '#e1bee7', dark: false },
  { key: 'paper', label: 'Paper', swatch: '#f5f5f0', dark: false },
  { key: 'slate', label: 'Slate', swatch: '#3a4149', dark: true },
  { key: 'ink', label: 'Ink', swatch: '#23262b', dark: true },
];

export const DEFAULT_COLOR = 'yellow';

export function colorFor(key: string | null | undefined): NoteColor {
  return NOTE_COLORS.find((c) => c.key === key) ?? NOTE_COLORS[0];
}
