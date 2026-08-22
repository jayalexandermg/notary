/**
 * Editor keybindings. Stored as a JSON blob in the shared settings table so
 * every note window picks up a rebind immediately.
 *
 * Format: "Mod+Shift+B" where Mod is Ctrl on Windows/Linux and Cmd on macOS.
 */

export type ActionId =
  | 'bold'
  | 'italic'
  | 'code'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'todo'
  | 'toggle'
  | 'checkToggle'
  | 'timestamp'
  | 'sideline'
  | 'split';

export interface ActionMeta {
  id: ActionId;
  label: string;
  hint?: string;
}

export const EDITOR_ACTIONS: ActionMeta[] = [
  { id: 'bold', label: 'Bold' },
  { id: 'italic', label: 'Italic' },
  { id: 'code', label: 'Inline code' },
  { id: 'heading1', label: 'Heading 1' },
  { id: 'heading2', label: 'Heading 2' },
  { id: 'heading3', label: 'Heading 3' },
  { id: 'bullet', label: 'Bullet' },
  { id: 'todo', label: 'Todo', hint: 'Tab then Enter also works' },
  { id: 'toggle', label: 'Toggle block' },
  { id: 'checkToggle', label: 'Check / uncheck todo' },
  { id: 'timestamp', label: 'Tag date & time' },
  { id: 'sideline', label: 'Sideline selection' },
  { id: 'split', label: 'Split selection to new note' },
];

export type Keymap = Record<ActionId, string>;

export const DEFAULT_KEYMAP: Keymap = {
  bold: 'Mod+B',
  italic: 'Mod+I',
  code: 'Mod+E',
  heading1: 'Mod+Alt+1',
  heading2: 'Mod+Alt+2',
  heading3: 'Mod+Alt+3',
  bullet: 'Mod+Shift+8',
  todo: 'Mod+Shift+T',
  toggle: 'Mod+Shift+O',
  checkToggle: 'Mod+Enter',
  timestamp: 'Mod+Shift+D',
  sideline: 'Mod+Shift+S',
  split: 'Mod+Shift+X',
};

export interface GlobalHotkeys {
  newNote: string;
  toggleAll: string;
}

export const DEFAULT_GLOBAL_HOTKEYS: GlobalHotkeys = {
  newNote: 'Ctrl+Alt+N',
  toggleAll: 'Ctrl+Alt+H',
};

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Serialize a keyboard event into the same shape as the stored bindings. */
export function eventToBinding(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = [];
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod) parts.push('Mod');
  if (isMac ? e.ctrlKey : e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = normalizeKey(e.key);
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return parts.join('+');
  parts.push(key);
  return parts.join('+');
}

/**
 * `Mod+Shift+8` is typed as `Mod+Shift+*` on most layouts, so compare the
 * physical digit too rather than only the produced character.
 */
export function matchesBinding(e: KeyboardEvent | React.KeyboardEvent, binding: string): boolean {
  if (!binding) return false;
  const direct = eventToBinding(e);
  if (direct.toLowerCase() === binding.toLowerCase()) return true;

  const native = e as KeyboardEvent;
  if (native.code && native.code.startsWith('Digit')) {
    const withDigit = direct.replace(/[^+]+$/, native.code.replace('Digit', ''));
    if (withDigit.toLowerCase() === binding.toLowerCase()) return true;
  }
  return false;
}

/** Human readable form for the settings UI. */
export function formatBinding(binding: string): string {
  if (!binding) return 'unassigned';
  return binding
    .split('+')
    .map((part) => {
      if (part === 'Mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'Alt') return isMac ? '⌥' : 'Alt';
      if (part === 'Shift') return isMac ? '⇧' : 'Shift';
      if (part === 'Meta') return isMac ? 'Ctrl' : 'Win';
      return part;
    })
    .join(isMac ? '' : '+');
}

export function parseKeymap(raw: string | null): Keymap {
  if (!raw) return { ...DEFAULT_KEYMAP };
  try {
    const parsed = JSON.parse(raw) as Partial<Keymap>;
    return { ...DEFAULT_KEYMAP, ...parsed };
  } catch {
    return { ...DEFAULT_KEYMAP };
  }
}

export function parseGlobalHotkeys(raw: string | null): GlobalHotkeys {
  if (!raw) return { ...DEFAULT_GLOBAL_HOTKEYS };
  try {
    const parsed = JSON.parse(raw) as Partial<GlobalHotkeys>;
    return { ...DEFAULT_GLOBAL_HOTKEYS, ...parsed };
  } catch {
    return { ...DEFAULT_GLOBAL_HOTKEYS };
  }
}

/** Global shortcuts are registered by Tauri, which wants `CmdOrCtrl` style. */
export function toTauriAccelerator(binding: string): string {
  return binding
    .split('+')
    .map((part) => (part === 'Mod' ? 'CmdOrCtrl' : part))
    .join('+');
}
