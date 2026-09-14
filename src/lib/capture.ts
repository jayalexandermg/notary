import { invoke } from '@tauri-apps/api/core';

export interface Capture {
  id: string;
  type: 'capture';
  schema_version: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  lifecycle_at: string;
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
export interface EditorData { record: Capture | null; project_id: string | null; presentation: Presentation; quit_requested: boolean }
export interface SurfacePreferences { opacity: number; always_on_top: boolean }
export interface Container { id: string; name: string; kind: 'waiting_room' | 'project'; capture_count: number; parent_id: string | null }
export interface CaptureContext { containers: Container[]; primary_container_id: string | null }
export interface ShortcutStatus { binding: string; registered: boolean; error: string | null }
export interface LegacyNote { id: string; title: string; content: string; created_at: string }

export const api = {
  captureReady: () => invoke<CaptureSession>('capture_surface_ready'),
  inputReady: (sequence: number, frontend_focus_ms?: number, frontend_ready_ms?: number) => invoke<void>('capture_input_ready', { sequence, frontend_focus_ms, frontend_ready_ms }),
  commit: (sequence: number, content: string, title: string | null = null, container_id: string | null = null) => invoke<Capture>('commit_capture', { sequence, content, title, container_id }),
  cancel: (sequence: number) => invoke<void>('cancel_capture', { sequence }),
  commitElapsed: (sequence: number, milliseconds: number) => invoke<void>('report_commit_elapsed', { sequence, milliseconds }),
  expand: (expanded: boolean, focused = false, height?: number, inspector = false) => invoke<void>('set_anchor_expanded', { expanded, focused, height, inspector, pixel_ratio: window.devicePixelRatio }),
  list: (container_id = 'waiting-room') => invoke<Capture[]>('list_captures', { container_id }),
  context: () => invoke<CaptureContext>('get_capture_context'),
  createProject: (name: string, parent_id: string | null = null) => invoke<Container>('create_project', { name, parent_id }),
  setPrimary: (id: string | null) => invoke<void>('set_primary_project', { id }),
  reassign: (id: string, container_id: string) => invoke<Capture>('reassign_capture', { id, container_id }),
  legacy: () => invoke<LegacyNote[]>('list_legacy_notes'),
  get: (id: string) => invoke<Capture>('get_capture', { id }),
  engage: (id: string) => invoke<void>('engage_capture', { id }),
  newNote: (project_id: string) => invoke<void>('new_project_note', { project_id }),
  loadEditor: () => invoke<EditorData>('load_editor'),
  editorCloseSettled: (close_token: string) => invoke<void>('editor_close_settled', { close_token }),
  saveEditor: (content: string, title: string | null, dismiss: boolean, opacity: number, always_on_top: boolean, close_token?: string) =>
    invoke<Capture | null>('save_editor', { content, title, dismiss, opacity, always_on_top, close_token }),
  editorPresentation: (opacity: number, always_on_top: boolean) => invoke<void>('update_editor_presentation', { opacity, always_on_top }),
  trashEditor: (close_token?: string) => invoke<void>('trash_editor', { close_token }),
  deleted: () => invoke<Capture[]>('list_deleted_captures'),
  restore: (id: string) => invoke<Capture>('restore_capture', { id }),
  purge: (id: string, confirmed: boolean) => invoke<void>('permanently_delete_capture', { id, confirmed }),
  quickPreferences: () => invoke<SurfacePreferences>('get_quick_presentation'),
  quickPresentation: (opacity: number, always_on_top: boolean) => invoke<void>('update_quick_presentation', { opacity, always_on_top }),
  captureRouter: (open: boolean) => invoke<void>('set_capture_router', { open, pixel_ratio: window.devicePixelRatio }),
  shortcut: () => invoke<ShortcutStatus>('get_capture_shortcut'),
  setShortcut: (binding: string) => invoke<ShortcutStatus>('set_capture_shortcut', { binding }),
  quit: () => invoke<void>('finish_quit'),
};

export function captureLabel(record: { title?: string; content: string }): string {
  return record.title || record.content.split('\n').find(line => line.trim()) || 'Untitled thought';
}
