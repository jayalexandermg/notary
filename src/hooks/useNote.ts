import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getNote, updateNote, Note } from '../lib/tauri';

export function useNote(noteId: string) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveTimeoutRef = useRef<number | null>(null);
  const positionTimeoutRef = useRef<number | null>(null);

  // Fetch note data
  useEffect(() => {
    async function fetchNote() {
      try {
        const data = await getNote(noteId);
        setNote(data);
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load note');
        setLoading(false);
      }
    }
    fetchNote();
  }, [noteId]);

  // Update content with debounce
  const updateContent = useCallback(
    (content: string) => {
      setNote((prev) => (prev ? { ...prev, content } : null));

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(() => {
        updateNote(noteId, { content }).catch(console.error);
      }, 300);
    },
    [noteId]
  );

  // Update opacity
  const updateOpacity = useCallback(
    async (opacity: number) => {
      setNote((prev) => (prev ? { ...prev, opacity } : null));
      await updateNote(noteId, { opacity });
    },
    [noteId]
  );

  // Update always on top
  const updateAlwaysOnTop = useCallback(
    async (alwaysOnTop: boolean) => {
      setNote((prev) => (prev ? { ...prev, always_on_top: alwaysOnTop } : null));
      const window = getCurrentWindow();
      await window.setAlwaysOnTop(alwaysOnTop);
      await updateNote(noteId, { always_on_top: alwaysOnTop });
    },
    [noteId]
  );

  // Listen for window move/resize events
  useEffect(() => {
    const window = getCurrentWindow();
    let unlistenMove: (() => void) | null = null;
    let unlistenResize: (() => void) | null = null;

    async function setupListeners() {
      unlistenMove = await window.onMoved(({ payload }) => {
        if (positionTimeoutRef.current) {
          clearTimeout(positionTimeoutRef.current);
        }
        positionTimeoutRef.current = globalThis.setTimeout(() => {
          updateNote(noteId, {
            pos_x: Math.round(payload.x),
            pos_y: Math.round(payload.y),
          }).catch(console.error);
        }, 300);
      });

      unlistenResize = await window.onResized(({ payload }) => {
        if (positionTimeoutRef.current) {
          clearTimeout(positionTimeoutRef.current);
        }
        positionTimeoutRef.current = globalThis.setTimeout(() => {
          updateNote(noteId, {
            width: Math.round(payload.width),
            height: Math.round(payload.height),
          }).catch(console.error);
        }, 300);
      });
    }

    setupListeners();

    return () => {
      if (unlistenMove) unlistenMove();
      if (unlistenResize) unlistenResize();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (positionTimeoutRef.current) clearTimeout(positionTimeoutRef.current);
    };
  }, [noteId]);

  return {
    note,
    loading,
    error,
    updateContent,
    updateOpacity,
    updateAlwaysOnTop,
  };
}
