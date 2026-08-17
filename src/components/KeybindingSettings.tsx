import { useState } from 'react';
import { EDITOR_ACTIONS, ActionId, DEFAULT_GLOBAL_HOTKEYS, DEFAULT_KEYMAP, GlobalHotkeys, Keymap, eventToBinding, formatBinding } from '../lib/keybindings';

interface KeybindingSettingsProps {
  keymap: Keymap;
  globalHotkeys: GlobalHotkeys;
  onKeymapChange: (keymap: Keymap) => void;
  onGlobalHotkeysChange: (hotkeys: GlobalHotkeys) => void;
  onClose: () => void;
}

type RecordTarget = { kind: 'action'; id: ActionId } | { kind: 'global'; id: keyof GlobalHotkeys };

function RecordButton({
  binding,
  recording,
  onStart,
  onCapture,
  onReset,
}: {
  binding: string;
  recording: boolean;
  onStart: () => void;
  onCapture: (binding: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="keybind-row-actions">
      <button
        type="button"
        className={`keybind-record${recording ? ' is-recording' : ''}`}
        onClick={onStart}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === 'Escape') {
            onReset();
            return;
          }
          if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;
          onCapture(eventToBinding(e));
        }}
      >
        {recording ? 'Press keys…' : formatBinding(binding)}
      </button>
    </div>
  );
}

export function KeybindingSettings({
  keymap,
  globalHotkeys,
  onKeymapChange,
  onGlobalHotkeysChange,
  onClose,
}: KeybindingSettingsProps) {
  const [recording, setRecording] = useState<RecordTarget | null>(null);

  const capture = (binding: string) => {
    if (!recording) return;
    if (recording.kind === 'action') {
      onKeymapChange({ ...keymap, [recording.id]: binding });
    } else {
      onGlobalHotkeysChange({ ...globalHotkeys, [recording.id]: binding });
    }
    setRecording(null);
  };

  const resetAll = () => {
    onKeymapChange({ ...DEFAULT_KEYMAP });
    onGlobalHotkeysChange({ ...DEFAULT_GLOBAL_HOTKEYS });
  };

  return (
    <div className="keybind-panel">
      <div className="keybind-panel-header">
        <span>Keyboard shortcuts</span>
        <button type="button" onClick={onClose} title="Close">
          ×
        </button>
      </div>

      <div className="keybind-panel-body">
        <p className="keybind-section-label">Global</p>
        <div className="keybind-row">
          <span>New note</span>
          <RecordButton
            binding={globalHotkeys.newNote}
            recording={recording?.kind === 'global' && recording.id === 'newNote'}
            onStart={() => setRecording({ kind: 'global', id: 'newNote' })}
            onCapture={capture}
            onReset={() => setRecording(null)}
          />
        </div>
        <div className="keybind-row">
          <span>Show / hide all notes</span>
          <RecordButton
            binding={globalHotkeys.toggleAll}
            recording={recording?.kind === 'global' && recording.id === 'toggleAll'}
            onStart={() => setRecording({ kind: 'global', id: 'toggleAll' })}
            onCapture={capture}
            onReset={() => setRecording(null)}
          />
        </div>

        <p className="keybind-section-label">Editor</p>
        {EDITOR_ACTIONS.map((action) => (
          <div className="keybind-row" key={action.id}>
            <span>
              {action.label}
              {action.hint && <em className="keybind-hint">{action.hint}</em>}
            </span>
            <RecordButton
              binding={keymap[action.id]}
              recording={recording?.kind === 'action' && recording.id === action.id}
              onStart={() => setRecording({ kind: 'action', id: action.id })}
              onCapture={capture}
              onReset={() => setRecording(null)}
            />
          </div>
        ))}

        <button type="button" className="keybind-reset" onClick={resetAll}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
