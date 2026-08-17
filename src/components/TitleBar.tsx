import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createNote, startDragging, minimizeWindow, closeNoteWindow, deleteNote } from '../lib/tauri';

interface TitleBarProps {
  noteId: string;
  title: string;
  alwaysOnTop: boolean;
  onTogglePin: () => void;
  onBeforeClose?: () => Promise<void>;
  onTitleChange: (title: string) => void;
  settings: React.ReactNode;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

export function TitleBar({
  noteId,
  title,
  alwaysOnTop,
  onTogglePin,
  onBeforeClose,
  onTitleChange,
  settings,
  settingsOpen,
  onToggleSettings,
}: TitleBarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.settings-dropdown') && !target.closest('.settings-trigger')) {
        onToggleSettings();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen, onToggleSettings]);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('.settings-dropdown') ||
      (e.target as HTMLElement).closest('.note-title')
    )
      return;
    await startDragging();
  };

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  };

  const handleNewNote = async () => {
    await createNote();
  };

  const handleMinimize = async () => await minimizeWindow();

  const handleClose = async () => {
    if (onBeforeClose) await onBeforeClose();
    await closeNoteWindow(noteId);
  };

  const handleDelete = async () => {
    if (confirm('Delete this note permanently?')) {
      await deleteNote(noteId);
    }
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (editTitle !== title) onTitleChange(editTitle);
  };

  return (
    <div
      className="titlebar flex items-center justify-between px-2 py-1 cursor-move select-none rounded-t-lg"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <button onClick={handleNewNote} className="titlebar-button" title="New note (+)">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {isEditingTitle ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setEditTitle(title);
                setIsEditingTitle(false);
              }
            }}
            className="flex-1 min-w-0 px-1 py-0 text-xs bg-transparent border-b border-gray-400 focus:outline-none focus:border-blue-500"
            autoFocus
          />
        ) : (
          <span
            onClick={() => {
              setEditTitle(title);
              setIsEditingTitle(true);
            }}
            className="note-title flex-1 min-w-0 truncate text-xs opacity-70 hover:opacity-100 cursor-text"
            title="Click to edit title"
          >
            {title || 'Untitled'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onTogglePin}
          className={`titlebar-button ${alwaysOnTop ? 'pin-active' : ''}`}
          title={alwaysOnTop ? 'Unpin from top' : 'Pin to top'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={alwaysOnTop ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z" />
          </svg>
        </button>

        <button onClick={handleDelete} className="titlebar-button hover:!bg-red-500 hover:!text-white" title="Delete note permanently">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>

        <div className="relative">
          <button onClick={onToggleSettings} className="titlebar-button settings-trigger" title="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {settingsOpen && settings}
        </div>

        <button onClick={handleMinimize} className="titlebar-button" title="Minimize">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <button onClick={handleClose} className="titlebar-button close" title="Close (hide note)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
