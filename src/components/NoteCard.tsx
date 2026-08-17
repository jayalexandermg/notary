import { useCallback, useEffect, useRef, useState } from 'react';
import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { useNote } from '../hooks/useNote';
import { useSharedSettings } from '../hooks/useSharedSettings';
import { TitleBar } from './TitleBar';
import { TransparencySlider } from './TransparencySlider';
import { BlockEditor, EditorApi } from './BlockEditor';
import { FormatToolbar, ToolbarAction } from './FormatToolbar';
import { SettingsMenu } from './SettingsMenu';
import { SidelineTray } from './SidelineTray';
import { SelectionMenu, SelectionMenuItem } from './SelectionMenu';
import { KeybindingSettings } from './KeybindingSettings';
import { createNote, setAllColor, setAllOpacity, setAllSize, updateNote } from '../lib/tauri';
import { addToSideline, getSideline } from '../lib/sideline';
import { colorFor } from '../lib/colors';

interface NoteCardProps {
  noteId: string;
}

export function NoteCard({ noteId }: NoteCardProps) {
  const { note, loading, error, updateContent, updateOpacity, updateColor, updateAutoStamp, updateAlwaysOnTop, updateTitle, saveNow, flushAndGetContent } =
    useNote(noteId);
  const shared = useSharedSettings();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [keybindOpen, setKeybindOpen] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [sidelineCount, setSidelineCount] = useState(() => getSideline().length);

  const editorApiRef = useRef<EditorApi | null>(null);

  useEffect(() => {
    const tick = () => setSidelineCount(getSideline().length);
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Sync-aware opacity handler — used by both the settings slider and the bottom slider
  const handleOpacityChange = useCallback(
    (newOpacity: number) => {
      updateOpacity(newOpacity);
      if (shared.universalMode) {
        setAllOpacity(newOpacity).catch(console.error);
      }
    },
    [updateOpacity, shared.universalMode]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      updateColor(color);
      if (shared.universalMode) {
        setAllColor(color).catch(console.error);
      }
    },
    [updateColor, shared.universalMode]
  );

  const handleSizePreset = useCallback(
    async (width: number, height: number, maximize: boolean) => {
      const win = getCurrentWindow();
      if (maximize) {
        await win.maximize();
      } else {
        if (await win.isMaximized()) await win.unmaximize();
        await win.setSize(new LogicalSize(width, height));
        if (shared.universalMode) setAllSize(width, height).catch(console.error);
      }
    },
    [shared.universalMode]
  );

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    getCurrentWindow()
      .startResizeDragging('SouthEast')
      .catch(console.error);
  }, []);

  const handleToolbarAction = useCallback(
    (action: ToolbarAction) => {
      const api = editorApiRef.current;
      if (!api) return;
      switch (action) {
        case 'bold':
        case 'italic':
        case 'code':
        case 'todo':
        case 'timestamp':
          api.runAction(action);
          break;
        case 'h1':
          api.setBlockType('h1');
          break;
        case 'h2':
          api.setBlockType('h2');
          break;
        case 'h3':
          api.setBlockType('h3');
          break;
        case 'bullet':
          api.setBlockType('bullet');
          break;
        case 'toggle':
          api.setBlockType('toggle');
          break;
        case 'wrapToggle':
          api.wrapSelectionInToggle();
          break;
        case 'sideline': {
          const text = api.getSelectionText();
          if (text) {
            addToSideline(text, note?.title || 'Untitled');
            setSidelineCount(getSideline().length);
          }
          break;
        }
        case 'sidelineTray':
          setTrayOpen((v) => !v);
          break;
        case 'split': {
          const text = api.cutSelection();
          if (text) {
            createSplitNote(text).catch(console.error);
          }
          break;
        }
        case 'merge':
          setSettingsOpen(true);
          break;
      }
    },
    [note?.title]
  );

  const createSplitNote = useCallback(async (text: string) => {
    const created = await createNote();
    await updateNote(created.id, { content: text, title: 'Split note' });
  }, []);

  const selectionItems: SelectionMenuItem[] = [
    {
      label: 'Sideline',
      onSelect: () => {
        const text = editorApiRef.current?.getSelectionText() ?? '';
        if (text) {
          addToSideline(text, note?.title || 'Untitled');
          setSidelineCount(getSideline().length);
        }
      },
    },
    {
      label: 'Split into new note',
      onSelect: () => {
        const text = editorApiRef.current?.cutSelection() ?? '';
        if (text) createSplitNote(text).catch(console.error);
      },
    },
    {
      label: 'Clone',
      onSelect: () => editorApiRef.current?.cloneSelection(),
    },
    {
      label: 'Wrap in toggle',
      onSelect: () => editorApiRef.current?.wrapSelectionInToggle(),
    },
    {
      label: 'Tag date & time',
      onSelect: () => editorApiRef.current?.stampCurrentBlock(),
    },
  ];

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

  const paletteColor = colorFor(note.color);

  return (
    <div
      className={`note-card h-screen w-screen flex flex-col rounded-lg shadow-note overflow-hidden${paletteColor.dark ? ' note-card-dark' : ''}`}
      style={{ opacity: note.opacity, ['--note-bg' as string]: paletteColor.swatch }}
    >
      <TitleBar
        noteId={noteId}
        title={note.title}
        alwaysOnTop={note.always_on_top}
        onTogglePin={() => updateAlwaysOnTop(!note.always_on_top)}
        onBeforeClose={saveNow}
        onTitleChange={updateTitle}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        settings={
          <SettingsMenu
            noteId={noteId}
            title={note.title}
            opacity={note.opacity}
            color={note.color}
            autoStamp={note.auto_stamp}
            universalMode={shared.universalMode}
            onOpacityChange={handleOpacityChange}
            onColorChange={handleColorChange}
            onAutoStampChange={updateAutoStamp}
            onUniversalModeChange={shared.setUniversalMode}
            onOpenKeybindings={() => {
              setSettingsOpen(false);
              setKeybindOpen(true);
            }}
            onGetLiveContent={flushAndGetContent}
            onMergeComplete={() => window.location.reload()}
          />
        }
      />

      <FormatToolbar
        open={toolbarOpen}
        onToggleOpen={() => setToolbarOpen((v) => !v)}
        keymap={shared.keymap}
        sidelineCount={sidelineCount}
        onAction={handleToolbarAction}
        onSizePreset={handleSizePreset}
      />

      <div className="flex-1 relative overflow-hidden">
        <BlockEditor
          content={note.content}
          onChange={updateContent}
          keymap={shared.keymap}
          autoStamp={note.auto_stamp}
          apiRef={editorApiRef}
          onSideline={(text) => {
            addToSideline(text, note.title || 'Untitled');
            setSidelineCount(getSideline().length);
          }}
          onSplit={(text) => createSplitNote(text).catch(console.error)}
          onSelectionContextMenu={(x, y) => setSelectionMenu({ x, y })}
        />

        {trayOpen && (
          <SidelineTray
            open={trayOpen}
            onClose={() => setTrayOpen(false)}
            onInsert={(text) => editorApiRef.current?.insertText(text)}
          />
        )}

        {selectionMenu && (
          <SelectionMenu
            x={selectionMenu.x}
            y={selectionMenu.y}
            items={selectionItems}
            onClose={() => setSelectionMenu(null)}
          />
        )}

        {keybindOpen && (
          <div className="keybind-overlay">
            <KeybindingSettings
              keymap={shared.keymap}
              globalHotkeys={shared.globalHotkeys}
              onKeymapChange={shared.setKeymap}
              onGlobalHotkeysChange={shared.setGlobalHotkeys}
              onClose={() => setKeybindOpen(false)}
            />
          </div>
        )}

        <div className="resize-handle" onMouseDown={handleResizeStart}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="18" cy="18" r="2" />
            <circle cx="12" cy="18" r="2" />
            <circle cx="18" cy="12" r="2" />
          </svg>
        </div>
      </div>

      <TransparencySlider opacity={note.opacity} onChange={handleOpacityChange} />
    </div>
  );
}
