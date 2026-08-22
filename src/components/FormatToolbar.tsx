import { SIZE_PRESETS, applySizePreset } from '../lib/sizes';
import { formatBinding, Keymap } from '../lib/keybindings';

interface FormatToolbarProps {
  open: boolean;
  onToggleOpen: () => void;
  keymap: Keymap;
  sidelineCount: number;
  onAction: (action: ToolbarAction) => void;
  onSizePreset?: (width: number, height: number, maximize: boolean) => void;
}

export type ToolbarAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'todo'
  | 'toggle'
  | 'wrapToggle'
  | 'timestamp'
  | 'sideline'
  | 'sidelineTray'
  | 'split'
  | 'merge';

function Button({
  label,
  title,
  onClick,
  active,
  wide,
}: {
  label: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`toolbar-button${active ? ' is-active' : ''}${wide ? ' is-wide' : ''}`}
      // Keep the caret in the editor so formatting applies to the selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function FormatToolbar({
  open,
  onToggleOpen,
  keymap,
  sidelineCount,
  onAction,
  onSizePreset,
}: FormatToolbarProps) {
  return (
    <div className={`format-toolbar${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="toolbar-handle"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleOpen}
        title={open ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points={open ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
        </svg>
        <span className="toolbar-handle-label">Format</span>
      </button>

      {open && (
        <div className="toolbar-rows">
          <div className="toolbar-row">
            <Button label={<b>B</b>} title={`Bold — ${formatBinding(keymap.bold)}`} onClick={() => onAction('bold')} />
            <Button label={<i>I</i>} title={`Italic — ${formatBinding(keymap.italic)}`} onClick={() => onAction('italic')} />
            <Button label={<span className="mono">{'</>'}</span>} title={`Code — ${formatBinding(keymap.code)}`} onClick={() => onAction('code')} />
            <span className="toolbar-sep" />
            <Button label="H1" title={`Heading 1 — ${formatBinding(keymap.heading1)}`} onClick={() => onAction('h1')} />
            <Button label="H2" title={`Heading 2 — ${formatBinding(keymap.heading2)}`} onClick={() => onAction('h2')} />
            <Button label="H3" title={`Heading 3 — ${formatBinding(keymap.heading3)}`} onClick={() => onAction('h3')} />
            <span className="toolbar-sep" />
            <Button label="•" title={`Bullet — ${formatBinding(keymap.bullet)}`} onClick={() => onAction('bullet')} />
            <Button
              label="☐"
              title={`New todo line — ${formatBinding(keymap.todo)} (or Tab then Enter)`}
              onClick={() => onAction('todo')}
            />
            <Button label="▾" title={`Toggle block — ${formatBinding(keymap.toggle)}`} onClick={() => onAction('toggle')} />
            <Button label="⊞" title="Wrap selection in a toggle" onClick={() => onAction('wrapToggle')} />
          </div>

          <div className="toolbar-row">
            <Button
              label="⏱"
              title={`Tag block with date & time — ${formatBinding(keymap.timestamp)}`}
              onClick={() => onAction('timestamp')}
            />
            <Button
              label="⇤"
              title={`Sideline selection — ${formatBinding(keymap.sideline)}`}
              onClick={() => onAction('sideline')}
            />
            <Button
              label={<span>Tray{sidelineCount > 0 ? ` ${sidelineCount}` : ''}</span>}
              title="Open the sideline tray"
              onClick={() => onAction('sidelineTray')}
              active={sidelineCount > 0}
              wide
            />
            <Button
              label="✂"
              title={`Split selection into a new note — ${formatBinding(keymap.split)}`}
              onClick={() => onAction('split')}
            />
            <Button label="⇄" title="Combine with another note" onClick={() => onAction('merge')} wide />
          </div>

          <div className="toolbar-row">
            <span className="toolbar-label">Size</span>
            {SIZE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                label={preset.label}
                title={`Resize to ${preset.label.toLowerCase()}`}
                wide
                onClick={() => {
                  if (onSizePreset) {
                    onSizePreset(preset.width, preset.height, !!preset.maximize);
                  } else {
                    applySizePreset(preset).catch(console.error);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
