import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { NoteCard } from './components/NoteCard';

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const loadWindowLabel = () => {
      try {
        const label = getCurrentWindow().label;
        if (!cancelled) {
          setWindowLabel(label);
          setError(null);
        }
      } catch (e) {
        attempts += 1;
        if (attempts < 20) {
          window.setTimeout(loadWindowLabel, 50);
          return;
        }

        console.error('Failed to get window label:', e);
        if (!cancelled) {
          setError('Window initialization failed');
        }
      }
    };

    loadWindowLabel();

    return () => {
      cancelled = true;
    };
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
