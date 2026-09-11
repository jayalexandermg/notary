import { invoke } from '@tauri-apps/api/core';

export interface Capture {
  id: string;
  type: 'capture';
  schema_version: string;
  created_at: string;
  updated_at: string;
  source: string;
  content: string;
  container_id: string;
  title?: string;
  derived_from?: string;
  [key: string]: unknown;
}

export interface Presentation {
  record_id: string;
  device_id: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  opacity: number;
  always_on_top: boolean;
  is_open: boolean;
  is_minimized: boolean;
}

export interface CaptureSession { sequence: number; active: boolean }
export interface Container { id: string; name: string; kind: 'waiting_room' | 'project'; capture_count: number; parent_id: string | null }
export interface CaptureContext { containers: Container[]; primary_container_id: string | null }
export interface ShortcutStatus { binding: string; registered: boolean; error: string | null }
export interface LegacyNote { id: string; title: string; content: string; created_at: string }

export const api = {
  captureReady: () => invoke<CaptureSession>('capture_surface_ready'),
  inputReady: (sequence: number) => invoke<void>('capture_input_ready', { sequence }),
  commit: (sequence: number, content: string) => invoke<Capture>('commit_capture', { sequence, content }),
  cancel: (sequence: number) => invoke<void>('cancel_capture', { sequence }),
  commitElapsed: (sequence: number, milliseconds: number) => invoke<void>('report_commit_elapsed', { sequence, milliseconds }),
  expand: (expanded: boolean, focused = false, height?: number) => invoke<void>('set_anchor_expanded', { expanded, focused, height }),
  list: (container_id = 'waiting-room') => invoke<Capture[]>('list_captures', { container_id }),
  context: () => invoke<CaptureContext>('get_capture_context'),
  createProject: (name: string, parent_id: string | null = null) => invoke<Container>('create_project', { name, parent_id }),
  setPrimary: (id: string | null) => invoke<void>('set_primary_project', { id }),
  reassign: (id: string, container_id: string) => invoke<Capture>('reassign_capture', { id, container_id }),
  legacy: () => invoke<LegacyNote[]>('list_legacy_notes'),
  get: (id: string) => invoke<Capture>('get_capture', { id }),
  engage: (id: string) => invoke<void>('engage_capture', { id }),
  pending: () => invoke<string | null>('pending_editor'),
  showEditor: (id: string) => invoke<Presentation>('show_editor', { id }),
  save: (id: string, content: string, title: string | null, dismiss = false) =>
    invoke<Capture>('save_capture_edit', { id, content, title, dismiss }),
  presentation: (id: string, opacity: number, always_on_top: boolean) =>
    invoke<void>('update_capture_presentation', { id, opacity, always_on_top }),
  shortcut: () => invoke<ShortcutStatus>('get_capture_shortcut'),
  setShortcut: (binding: string) => invoke<ShortcutStatus>('set_capture_shortcut', { binding }),
  quit: () => invoke<void>('finish_quit'),
};

export function captureLabel(record: { title?: string; content: string }): string {
  return record.title || record.content.split('\n').find(line => line.trim()) || 'Untitled thought';
}
