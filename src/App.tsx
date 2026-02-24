import { getCurrentWindow } from '@tauri-apps/api/window';
import { NoteCard } from './components/NoteCard';

// No URL routing — identify what to render from the window label.
// Note windows are created with label "note-{uuid}".
const windowLabel = getCurrentWindow().label;

function App() {
  if (windowLabel.startsWith('note-')) {
    const noteId = windowLabel.replace('note-', '');
    return <NoteCard noteId={noteId} />;
  }

  return (
    <div className="p-4 text-sm opacity-50">
      HoverThought HUD — press Ctrl+Alt+N to create a note
    </div>
  );
}

export default App;
