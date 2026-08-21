import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface Note {
  id: string;
  title: string;
  content: string;
  mode: string;
  color: string;
  auto_stamp: boolean;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  opacity: number;
  is_open: boolean;
  is_minimized: boolean;
  always_on_top: boolean;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  theme: string;
  default_opacity: number;
}

export async function createNote(posX?: number, posY?: number): Promise<Note> {
  return invoke('create_note', { pos_x: posX, pos_y: posY });
}

export async function getNote(id: string): Promise<Note | null> {
  return invoke('get_note', { id });
}

export async function getAllNotes(): Promise<Note[]> {
  return invoke('get_all_notes');
}

export async function updateNote(
  id: string,
  updates: {
    title?: string;
    content?: string;
    mode?: string;
    color?: string;
    auto_stamp?: boolean;
    pos_x?: number;
    pos_y?: number;
    width?: number;
    height?: number;
    opacity?: number;
    always_on_top?: boolean;
  }
): Promise<void> {
  return invoke('update_note', {
    id,
    title: updates.title,
    content: updates.content,
    mode: updates.mode,
    color: updates.color,
    auto_stamp: updates.auto_stamp,
    pos_x: updates.pos_x,
    pos_y: updates.pos_y,
    width: updates.width,
    height: updates.height,
    opacity: updates.opacity,
    always_on_top: updates.always_on_top,
  });
}

export async function closeNote(id: string): Promise<void> {
  return invoke('close_note', { id });
}

export async function deleteNote(id: string): Promise<void> {
  return invoke('delete_note', { id });
}

export async function openNote(id: string): Promise<Note> {
  return invoke('open_note', { id });
}

export async function closeNoteWindow(id: string): Promise<void> {
  return invoke('close_note', { id });
}

export async function setOpacity(opacity: number): Promise<void> {
  return invoke('set_opacity', { opacity });
}

export async function setAlwaysOnTop(onTop: boolean): Promise<void> {
  return invoke('set_always_on_top', { on_top: onTop });
}

export async function getSettings(): Promise<Settings> {
  return invoke('get_settings');
}

export async function setTheme(theme: string): Promise<void> {
  return invoke('set_theme', { theme });
}

export async function setDefaultOpacity(opacity: number): Promise<void> {
  return invoke('set_default_opacity', { opacity });
}

export function startDragging(): Promise<void> {
  return getCurrentWindow().startDragging();
}

export function minimizeWindow(): Promise<void> {
  return getCurrentWindow().minimize();
}

export function closeWindow(): Promise<void> {
  return getCurrentWindow().close();
}

/* --- universal mode: act on every note at once --------------------------- */

export async function minimizeAllNotes(): Promise<void> {
  return invoke('minimize_all_notes');
}

export async function showAllNotes(): Promise<void> {
  return invoke('show_all_notes');
}

export async function setAllOpacity(opacity: number): Promise<void> {
  return invoke('set_all_opacity', { opacity });
}

export async function setAllColor(color: string): Promise<void> {
  return invoke('set_all_color', { color });
}

export async function setAllAlwaysOnTop(onTop: boolean): Promise<void> {
  return invoke('set_all_always_on_top', { on_top: onTop });
}

export async function setAllSize(width: number, height: number): Promise<void> {
  return invoke('set_all_size', { width, height });
}

/* --- shared key/value settings ------------------------------------------ */

export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('set_setting', { key, value });
}

export async function setGlobalHotkeys(newNote: string, toggleAll: string): Promise<void> {
  return invoke('set_global_hotkeys', { new_note: newNote, toggle_all: toggleAll });
}

/** Version of the running build, read from the binary itself. */
export async function getAppVersion(): Promise<string> {
  return invoke('get_app_version');
}
