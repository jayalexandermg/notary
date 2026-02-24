import { useState, useEffect } from 'react';
import { startDragging, createNote, minimizeWindow, closeNoteWindow, deleteNote, openNote, getAllNotes, updateNote, minimizeAllNotes, showAllNotes, setAllOpacity, Note } from '../lib/tauri';

interface TitleBarProps {
  noteId: string;
  title: string;
  alwaysOnTop: boolean;
  opacity: number;
  onTogglePin: () => void;
  onOpacityChange: (opacity: number) => void;
  onBeforeClose?: () => Promise<void>;
  onTitleChange: (title: string) => void;
  onGetLiveContent: () => Promise<string>;
  onAddTodo: () => void;
}

export function TitleBar({ noteId, title, alwaysOnTop, opacity, onTogglePin, onOpacityChange, onBeforeClose, onTitleChange, onGetLiveContent, onAddTodo }: TitleBarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    if (showMenu) {
      getAllNotes().then(setNotes).catch(console.error);
    }
  }, [showMenu]);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  useEffect(() => {
    if (!showMenu && !showSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.menu-dropdown') && !target.closest('.menu-trigger') &&
          !target.closest('.settings-dropdown') && !target.closest('.settings-trigger')) {
        setShowMenu(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, showSettings]);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('.menu-dropdown') ||
        (e.target as HTMLElement).closest('.settings-dropdown') ||
        (e.target as HTMLElement).closest('.note-title')) return;
    await startDragging();
  };

  const handleNewNote = async () => {
    setShowMenu(false);
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

  const handleOpenNote = async (id: string) => {
    setShowMenu(false);
    if (id !== noteId) await openNote(id);
  };

  const handleMergeNote = async (sourceNote: Note) => {
    if (sourceNote.id === noteId) return;
    const liveContent = await onGetLiveContent();
    const separator = liveContent && sourceNote.content ? '\n\n---\n\n' : '';
    const mergedContent = liveContent + separator + sourceNote.content;
    const mergedTitle = title || sourceNote.title || 'Merged Note';
    await updateNote(noteId, { content: mergedContent, title: mergedTitle });
    await deleteNote(sourceNote.id);
    const updatedNotes = await getAllNotes();
    setNotes(updatedNotes);
    setShowMenu(false);
    window.location.reload();
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (editTitle !== title) onTitleChange(editTitle);
  };

  // Opacity: if synced, broadcast to all notes; else update just this one
  const handleOpacityChange = (newOpacity: number) => {
    onOpacityChange(newOpacity);
    if (isSynced) {
      setAllOpacity(newOpacity).catch(console.error);
    }
  };

  const handleSyncToggle = async () => {
    if (isSynced) {
      setIsSynced(false);
    } else {
      setIsSynced(true);
      await setAllOpacity(opacity); // immediately sync all to current note's opacity
    }
  };

  const handleMinimizeAll = async () => { setShowSettings(false); await minimizeAllNotes(); };
  const handleShowAll = async () => { setShowSettings(false); await showAllNotes(); };

  const handleAddTodo = () => {
    setShowSettings(false);
    onAddTodo();
  };

  return (
    <div
      className="titlebar flex items-center justify-between px-2 py-1 cursor-move select-none rounded-t-lg"
      onMouseDown={handleMouseDown}
    >
      {/* Left: notes menu + title */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <div className="relative">
          <button
            onClick={() => { setShowMenu(!showMenu); setShowSettings(false); }}
            className="titlebar-button menu-trigger"
            title="Notes menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    className={`flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${note.id === noteId ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
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
              if (e.key === 'Escape') { setEditTitle(title); setIsEditingTitle(false); }
            }}
            className="flex-1 min-w-0 px-1 py-0 text-xs bg-transparent border-b border-gray-400 focus:outline-none focus:border-blue-500"
            autoFocus
          />
        ) : (
          <span
            onClick={() => { setEditTitle(title); setIsEditingTitle(true); }}
            className="note-title flex-1 min-w-0 truncate text-xs opacity-70 hover:opacity-100 cursor-text"
            title="Click to edit title"
          >
            {title || 'Untitled'}
          </span>
        )}
      </div>

      {/* Right: pin, delete, settings, minimize, close */}
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

        <button
          onClick={handleDelete}
          className="titlebar-button hover:!bg-red-500 hover:!text-white"
          title="Delete note permanently"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>

        {/* Settings dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowSettings(!showSettings); setShowMenu(false); }}
            className="titlebar-button settings-trigger"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {showSettings && (
            <div
              className="settings-dropdown absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-52 z-50 p-3 overflow-y-auto"
              style={{ maxHeight: 'calc(100vh - 48px)' }}
            >
              {/* Opacity slider */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Opacity</span>
                  <span className="text-xs text-gray-500">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

              {/* Todo */}
              <button
                onClick={handleAddTodo}
                className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2 mb-1"
              >
                <span>☐</span> Add Todo Item
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

              {/* All Notes section */}
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">All Notes</p>

              {/* Sync Opacity toggle */}
              <button
                onClick={handleSyncToggle}
                className={`w-full px-2 py-1.5 text-left text-xs rounded flex items-center gap-2 mb-1 transition-colors ${
                  isSynced
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  {isSynced && <path d="M9 12l2 2 4-4" />}
                </svg>
                {isSynced ? 'Opacity Synced — Unsync' : 'Sync opacity to all'}
              </button>

              <button
                onClick={handleMinimizeAll}
                className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Minimize all
              </button>
              <button
                onClick={handleShowAll}
                className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></svg>
                Show all
              </button>
            </div>
          )}
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
