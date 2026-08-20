import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { NoteCard } from './components/NoteCard';

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const label = getCurrentWindow().label;
      setWindowLabel(label);
    } catch (e) {
      console.error('Failed to get window label:', e);
      setError('Window initialization failed');
    }
  }, []);

  if (error) {
    return <div className="p-4 text-sm text-red-500">{error}</div>;
  }

  if (!windowLabel) {
    return (
      <div className="note-card h-screen w-screen flex items-center justify-center rounded-lg shadow-note">
        <span className="text-sm opacity-50">Loading...</span>
      </div>
    );
  }

  if (windowLabel.startsWith('note-')) {
    const noteId = windowLabel.replace('note-', '');
    return <NoteCard noteId={noteId} />;
  }

  return (
    <div className="p-4 text-sm opacity-50">
      HoverThought — press Ctrl+Alt+N to create a note
    </div>
  );
}

export default App;
