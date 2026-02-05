import { useNote } from '../hooks/useNote';
import { TitleBar } from './TitleBar';
import { TransparencySlider } from './TransparencySlider';

interface NoteCardProps {
  noteId: string;
}

export function NoteCard({ noteId }: NoteCardProps) {
  const { note, loading, error, updateContent, updateOpacity, updateAlwaysOnTop, updateTitle, saveNow } = useNote(noteId);

  if (loading) {
    return (
      <div className="note-card h-screen w-screen flex items-center justify-center rounded-lg shadow-note">
        <span className="text-sm opacity-50">Loading...</span>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="note-card h-screen w-screen flex items-center justify-center rounded-lg shadow-note">
        <span className="text-sm text-red-500">{error || 'Note not found'}</span>
      </div>
    );
  }

  return (
    <div
      className="note-card h-screen w-screen flex flex-col rounded-lg shadow-note overflow-hidden"
      style={{ opacity: note.opacity }}
    >
      <TitleBar
        noteId={noteId}
        title={note.title}
        alwaysOnTop={note.always_on_top}
        onTogglePin={() => updateAlwaysOnTop(!note.always_on_top)}
        onBeforeClose={saveNow}
        onTitleChange={updateTitle}
      />

      <div className="flex-1 relative">
        <textarea
          className="note-textarea"
          value={note.content}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Start typing..."
          autoFocus
        />

        <TransparencySlider opacity={note.opacity} onChange={updateOpacity} />

        {/* Resize handle indicator */}
        <div className="resize-handle">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="18" cy="18" r="2" />
            <circle cx="12" cy="18" r="2" />
            <circle cx="18" cy="12" r="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}
