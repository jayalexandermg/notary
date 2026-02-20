import { useState, useEffect } from 'react';
import { startDragging, createNote, minimizeWindow, closeNoteWindow, deleteNote, openNote, getAllNotes, updateNote, Note } from '../lib/tauri';

interface TitleBarProps {
  noteId: string;
  title: string;
  alwaysOnTop: boolean;
  onTogglePin: () => void;
  onBeforeClose?: () => Promise<void>;
  onTitleChange: (title: string) => void;
  onGetLiveContent: () => Promise<string>;
}

export function TitleBar({ noteId, title, alwaysOnTop, onTogglePin, onBeforeClose, onTitleChange, onGetLiveContent }: TitleBarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  useEffect(() => {
    if (showMenu) {
      getAllNotes().then(setNotes).catch(console.error);
    }
  }, [showMenu]);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.menu-dropdown') && !target.closest('.menu-trigger')) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('.menu-dropdown') ||
        (e.target as HTMLElement).closest('.note-title')) return;
    await startDragging();
  };

  const handleNewNote = async () => {
    setShowMenu(false);
    await createNote();
  };

  const handleMinimize = async () => {
    await minimizeWindow();
  };

  const handleClose = async () => {
    if (onBeforeClose) {
      await onBeforeClose();
    }
    await closeNoteWindow(noteId);
  };

  const handleDelete = async () => {
    if (confirm('Delete this note permanently?')) {
      await deleteNote(noteId);
    }
  };

  const handleOpenNote = async (id: string) => {
    setShowMenu(false);
    if (id !== noteId) {
      await openNote(id);
    }
  };

  const handleMergeNote = async (sourceNote: Note) => {
    if (sourceNote.id === noteId) return;

    // Flush and get live content to avoid losing unsaved edits
    const liveContent = await onGetLiveContent();

    const separator = liveContent && sourceNote.content ? '\n\n---\n\n' : '';
    const mergedContent = liveContent + separator + sourceNote.content;
    const mergedTitle = title || sourceNote.title || 'Merged Note';

    // Update current note with merged content
    await updateNote(noteId, { content: mergedContent, title: mergedTitle });

    // Delete the source note
    await deleteNote(sourceNote.id);

    // Refresh the menu
    const updatedNotes = await getAllNotes();
    setNotes(updatedNotes);
    setShowMenu(false);

    // Trigger a refresh of the current note
    window.location.reload();
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (editTitle !== title) {
      onTitleChange(editTitle);
    }
  };

  const displayTitle = title || 'Untitled';

  return (
    <div
      className="titlebar flex items-center justify-between px-2 py-1 cursor-move select-none rounded-t-lg"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="titlebar-button menu-trigger"
            title="Notes menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {showMenu && (
            <div className="menu-dropdown absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-48 z-50">
              <button
                onClick={handleNewNote}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <span className="text-green-600">+</span> New Note
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <div className="max-h-48 overflow-y-auto">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className={`flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      note.id === noteId ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleOpenNote(note.id)}
                      className="flex-1 text-left text-sm flex items-center gap-2 min-w-0"
                    >
                      <span className={`text-xs ${note.is_open ? 'text-green-500' : 'text-gray-400'}`}>
                        {note.is_open ? '●' : '○'}
                      </span>
                      <span className="truncate">{note.title || 'Untitled'}</span>
                    </button>
                    {note.id !== noteId && (
                      <button
                        onClick={() => handleMergeNote(note)}
                        className="ml-2 px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-blue-500 hover:text-white rounded"
                        title="Merge into current note"
                      >
                        ← Merge
                      </button>
                    )}
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No notes</div>
                )}
              </div>
            </div>
          )}
        </div>

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
            {displayTitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onTogglePin}
          className={`titlebar-button ${alwaysOnTop ? 'pin-active' : ''}`}
          title={alwaysOnTop ? 'Unpin from top' : 'Pin to top'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill={alwaysOnTop ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="titlebar-button hover:!bg-red-500 hover:!text-white"
          title="Delete note permanently"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
        <button
          onClick={handleMinimize}
          className="titlebar-button"
          title="Minimize"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="titlebar-button close"
          title="Close (hide note)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

    </div>
  );
}
