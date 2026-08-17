import { useEffect, useState } from 'react';
import { NOTE_COLORS } from '../lib/colors';
import { Note, deleteNote, getAllNotes, minimizeAllNotes, openNote, showAllNotes, updateNote } from '../lib/tauri';

interface SettingsMenuProps {
  noteId: string;
  title: string;
  opacity: number;
  color: string;
  autoStamp: boolean;
  universalMode: boolean;
  onOpacityChange: (opacity: number) => void;
  onColorChange: (color: string) => void;
  onAutoStampChange: (value: boolean) => void;
  onUniversalModeChange: (value: boolean) => void;
  onOpenKeybindings: () => void;
  onGetLiveContent: () => Promise<string>;
  onMergeComplete: () => void;
}

export function SettingsMenu({
  noteId,
  title,
  opacity,
  color,
  autoStamp,
  universalMode,
  onOpacityChange,
  onColorChange,
  onAutoStampChange,
  onUniversalModeChange,
  onOpenKeybindings,
  onGetLiveContent,
  onMergeComplete,
}: SettingsMenuProps) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    getAllNotes().then(setNotes).catch(console.error);
  }, []);

  const handleMinimizeAll = () => minimizeAllNotes().catch(console.error);
  const handleShowAll = () => showAllNotes().catch(console.error);

  const handleMergeNote = async (sourceNote: Note) => {
    if (sourceNote.id === noteId) return;
    const liveContent = await onGetLiveContent();
    const sourceTitle = sourceNote.title || 'Untitled';
    const currentTitle = title || 'Untitled';

    // Non-destructive merge: each note's content lands inside its own
    // collapsible toggle, titled with the note it came from.
    const wrap = (blockTitle: string, body: string) =>
      body
        ? `▾ ${blockTitle}\n${body
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}`
        : `▾ ${blockTitle}`;

    const mergedContent = [wrap(currentTitle, liveContent), wrap(sourceTitle, sourceNote.content)].join('\n');
    const mergedTitle = title || sourceNote.title || 'Merged Note';
    await updateNote(noteId, { content: mergedContent, title: mergedTitle });
    await deleteNote(sourceNote.id);
    onMergeComplete();
  };

  return (
    <div className="settings-dropdown">
      <div className="settings-section">
        <div className="settings-row-between">
          <span className="settings-label">Opacity</span>
          <span className="settings-value">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
        />
      </div>

      <div className="settings-section">
        <span className="settings-label">Color</span>
        <div className="color-swatch-row">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`color-swatch${color === c.key ? ' is-active' : ''}`}
              style={{ background: c.swatch }}
              title={c.label}
              onClick={() => onColorChange(c.key)}
            />
          ))}
        </div>
      </div>

      <div className="settings-divider" />

      <button
        type="button"
        className={`settings-toggle-row${autoStamp ? ' is-on' : ''}`}
        onClick={() => onAutoStampChange(!autoStamp)}
      >
        <span>Auto date &amp; time stamp</span>
        <span className="settings-switch" />
      </button>

      <button type="button" className="settings-item" onClick={onOpenKeybindings}>
        Keyboard shortcuts…
      </button>

      <div className="settings-divider" />

      <p className="settings-label">All notes</p>

      <button
        type="button"
        className={`settings-toggle-row${universalMode ? ' is-on' : ''}`}
        onClick={() => onUniversalModeChange(!universalMode)}
        title="While on, opacity/color/size changes apply to every open note"
      >
        <span>Universal mode</span>
        <span className="settings-switch" />
      </button>

      <button type="button" className="settings-item" onClick={handleMinimizeAll}>
        Minimize all
      </button>
      <button type="button" className="settings-item" onClick={handleShowAll}>
        Show all
      </button>

      <div className="settings-divider" />

      <p className="settings-label">Other notes</p>
      <div className="settings-note-list">
        {notes
          .filter((n) => n.id !== noteId)
          .map((n) => (
            <div key={n.id} className="settings-note-item">
              <button
                type="button"
                className="settings-note-open"
                onClick={() => openNote(n.id).catch(console.error)}
                title="Open this note"
              >
                <span className={`note-dot ${n.is_open ? 'is-open' : ''}`} />
                <span className="truncate">{n.title || 'Untitled'}</span>
              </button>
              <button type="button" className="settings-merge-hint" onClick={() => handleMergeNote(n)} title="Combine into this note">
                Combine
              </button>
            </div>
          ))}
        {notes.filter((n) => n.id !== noteId).length === 0 && <p className="settings-empty">No other notes</p>}
      </div>
    </div>
  );
}
