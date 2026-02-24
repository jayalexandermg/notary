import { useCallback } from 'react';
import { useNote } from '../hooks/useNote';
import { TitleBar } from './TitleBar';
import { TransparencySlider } from './TransparencySlider';
import { NoteEditor } from './NoteEditor';

interface NoteCardProps {
  noteId: string;
}

export function NoteCard({ noteId }: NoteCardProps) {
  const { note, loading, error, updateContent, updateOpacity, updateAlwaysOnTop, updateTitle, saveNow, flushAndGetContent } = useNote(noteId);

  // Appends a new todo line to the note content
  const addTodoLine = useCallback(() => {
    if (!note) return;
    const newContent = note.content ? note.content + '\n- [ ] ' : '- [ ] ';
    updateContent(newContent);
  }, [note, updateContent]);

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
        opacity={note.opacity}
        onTogglePin={() => updateAlwaysOnTop(!note.always_on_top)}
        onOpacityChange={updateOpacity}
        onBeforeClose={saveNow}
        onTitleChange={updateTitle}
        onGetLiveContent={flushAndGetContent}
        onAddTodo={addTodoLine}
      />

      <div className="flex-1 relative overflow-hidden">
        <NoteEditor content={note.content} onChange={updateContent} />

        {/* Resize handle */}
        <div className="resize-handle">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="18" cy="18" r="2" />
            <circle cx="12" cy="18" r="2" />
            <circle cx="18" cy="12" r="2" />
          </svg>
        </div>
      </div>

      {/* Opacity slider — always visible at the bottom */}
      <TransparencySlider opacity={note.opacity} onChange={updateOpacity} />
    </div>
  );
}
