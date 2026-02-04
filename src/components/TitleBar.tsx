import { startDragging, createNote, closeNote, minimizeWindow } from '../lib/tauri';

interface TitleBarProps {
  noteId: string;
  alwaysOnTop: boolean;
  onTogglePin: () => void;
}

export function TitleBar({ noteId, alwaysOnTop, onTogglePin }: TitleBarProps) {
  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only start dragging from the titlebar itself, not buttons
    if ((e.target as HTMLElement).closest('button')) return;
    await startDragging();
  };

  const handleNewNote = async () => {
    await createNote();
  };

  const handleMinimize = async () => {
    await minimizeWindow();
  };

  const handleClose = async () => {
    await closeNote(noteId);
  };

  return (
    <div
      className="titlebar flex items-center justify-between px-2 py-1 cursor-move select-none rounded-t-lg"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={handleNewNote}
          className="titlebar-button"
          title="New note (Ctrl+Shift+N)"
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
          title="Close"
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
