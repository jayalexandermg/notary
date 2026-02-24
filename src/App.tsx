import { HashRouter, Routes, Route, useParams } from 'react-router-dom';
import { NoteCard } from './components/NoteCard';

function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();

  if (!noteId) {
    return <div>Invalid note ID</div>;
  }

  return <NoteCard noteId={noteId} />;
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/note/:noteId" element={<NotePage />} />
        <Route path="*" element={<div className="p-4">HoverThought HUD - Use Ctrl+Alt+N to create a note</div>} />
      </Routes>
    </HashRouter>
  );
}

export default App;
