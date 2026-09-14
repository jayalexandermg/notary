import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, Capture, SurfacePreferences } from '../lib/capture';
import { useCaptureContext } from '../hooks/useCaptureContext';

export default function CaptureEditor() {
  const { context } = useCaptureContext();
  const [record, setRecord] = useState<Capture | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [prefs, setPrefs] = useState<SurfacePreferences>({ opacity: 1, always_on_top: true });
  const preferences = useRef(prefs);
  const buffer = useRef({ content: '', title: '' });
  const input = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const closing = useRef(false);
  const reopenRequested = useRef(false);
  const quitRequested = useRef(false);
  const deleteStarted = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const ready = useRef(false);
  const loading = useRef(false);
  const savedId = useRef<string | null>(null);
  const revision = useRef(0);

  function save(dismiss = false, closeToken?: string) {
    clearTimeout(timer.current);
    const snapshot = { ...buffer.current }, version = revision.current;
    const task = queue.current.catch(() => {}).then(async () => {
      const view = preferences.current;
      const saved = await api.saveEditor(snapshot.content, snapshot.title.trim() ? snapshot.title : null, dismiss, view.opacity, view.always_on_top, closeToken);
      savedId.current = saved?.id || null;
      if (version === revision.current) { setRecord(saved); setMessage(saved ? 'Saved' : 'Draft'); }
      return saved;
    });
    queue.current = task;
    return task;
  }
  async function close(trash = false, quit = false) {
    if (quit) quitRequested.current = true;
    if (closing.current) return;
    if (!ready.current) { if (quitRequested.current && !loading.current) await api.quit().catch(error => setMessage(String(error))); return; }
    trash = trash || deleteStarted.current;
    closing.current = true; setBusy(true); clearTimeout(timer.current);
    let closed = false;
    const closeToken = crypto.randomUUID();
    try {
      if (trash) {
        await queue.current.catch(() => {});
        if (!deleteStarted.current && savedId.current) await save();
        deleteStarted.current = true; setDeleting(true);
        await api.trashEditor(closeToken);
      }
      else await save(true, closeToken);
      ready.current = false;
      closed = true;
      if (quitRequested.current) await api.quit();
    } catch (error) { setMessage(String(error)); }
    finally {
      closing.current = false; setBusy(false);
      if (reopenRequested.current) {
        reopenRequested.current = false;
        if (!quitRequested.current && !deleteStarted.current && savedId.current) {
          await api.engage(savedId.current).catch(error => setMessage(String(error)));
        }
      }
      if (closed && !quitRequested.current) {
        // Only settled, saved windows may enter the native eviction cache.
        void api.editorCloseSettled(closeToken).catch(error => setMessage(String(error)));
      }
    }
  }
  async function load() {
    if (closing.current || loading.current) return;
    loading.current = true; setBusy(true);
    try {
      const data = await api.loadEditor();
      deleteStarted.current = false; setDeleting(false);
      quitRequested.current ||= data.quit_requested;
      savedId.current = data.record?.id || null;
      const next = { content: data.record?.content || '', title: data.record?.title || '' };
      buffer.current = next; ++revision.current;
      setText(next.content); setTitle(next.title); setRecord(data.record); setProject(data.project_id);
      preferences.current = data.presentation; setPrefs(data.presentation);
      ready.current = true; setLoaded(true); setMessage(data.record ? 'Saved' : 'Draft');
      requestAnimationFrame(() => input.current?.focus());
    } catch (error) { setMessage(String(error)); }
    finally { loading.current = false; setBusy(false); if (quitRequested.current) void close(false, true); }
  }
  useEffect(() => {
    let stopped = false;
    const target = { target: getCurrentWindow().label };
    const subscriptions = [
      listen('editor-requested', () => {
        if (stopped) return;
        if (closing.current) reopenRequested.current = true;
        else if (!ready.current) void load();
      }, target),
      listen('surface-close-requested', () => { if (!stopped) void close(); }, target),
      listen('quit-requested', () => { if (!stopped) void close(false, true); }, target),
    ];
    void Promise.all(subscriptions).then(() => { if (!stopped) void load(); }).catch(error => setMessage(String(error)));
    return () => { stopped = true; clearTimeout(timer.current); for (const pending of subscriptions) void pending.then(unlisten => unlisten()); };
  }, []);
  function edit(content: string, title: string) {
    buffer.current = { content, title }; ++revision.current; setText(content); setTitle(title); setMessage('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save().catch(error => setMessage(`Save failed: ${String(error)}`)); }, 250);
  }
  function presentation(change: (value: SurfacePreferences) => SurfacePreferences) {
    queue.current = queue.current.catch(() => {}).then(async () => {
      const { opacity, always_on_top } = change(preferences.current);
      await api.editorPresentation(opacity, always_on_top);
      preferences.current = { opacity, always_on_top }; setPrefs(preferences.current);
    }).catch(error => setMessage(String(error)));
  }
  const container = record?.container_id || project;
  return <main className="capture-editor ht-surface" style={{ opacity: prefs.opacity }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); if (opacityOpen) setOpacityOpen(false); else void close(); }
    if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); if (!closing.current && !deleteStarted.current && ready.current) void save().catch(error => setMessage(String(error))); }
  }}>
    <header className="capture-editor-header">
      <button className="drag-grip" title="Drag to move" aria-label="Move note window" onMouseDown={event => {
        if (event.button === 0) void getCurrentWindow().startDragging().catch(error => setMessage(String(error)));
      }}>⠿</button>
      <input aria-label="Thought title" placeholder="Title…" value={title} readOnly={busy || deleting || !loaded} onChange={event => edit(text, event.target.value)} />
      <button title={prefs.always_on_top ? 'Unpin' : 'Pin'} aria-label="Pin note" aria-pressed={prefs.always_on_top} disabled={busy} onClick={() => presentation(value => ({ ...value, always_on_top: !value.always_on_top }))}>Pin</button>
      <button title="Opacity" aria-label="Note opacity" disabled={busy} onClick={() => setOpacityOpen(!opacityOpen)}>◐</button>
      <button title="Delete" aria-label="Delete note" disabled={busy || !loaded} onClick={() => void close(true)}>⌫</button>
      <button className="surface-close" title="Save & close" aria-label="Save and close thought" disabled={busy || !loaded} onClick={() => void close()}>×</button>
    </header>
    <textarea ref={input} aria-label="Thought content" value={text} readOnly={busy || deleting || !loaded} spellCheck onChange={event => edit(event.target.value, title)} />
    <footer className="capture-editor-footer">
      <span className="surface-destination" title={context?.containers.find(c => c.id === container)?.name || ''}>{context?.containers.find(c => c.id === container)?.name || 'Project'}</span>
      <span role="status" title={message}>{message}</span>
      <button className="editor-resize" title="Resize" aria-label="Resize thought" onMouseDown={() => void getCurrentWindow().startResizeDragging('SouthEast').catch(error => setMessage(String(error)))}>◢</button>
    </footer>
    {opacityOpen && <label className="opacity-popover">Opacity<input aria-label="Note opacity level" type="range" min="0.1" max="1" step="0.05" value={prefs.opacity} onChange={event => { const opacity = Number(event.target.value); presentation(value => ({ ...value, opacity })); }} /></label>}
  </main>;
}
