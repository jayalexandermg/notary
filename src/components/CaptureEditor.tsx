import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, Capture, Presentation } from '../lib/capture';
import { useCaptureContext } from '../hooks/useCaptureContext';

export default function CaptureEditor() {
  const { context, contextError } = useCaptureContext();
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState('waiting-room');
  const [record, setRecord] = useState<Capture | null>(null);
  const [view, setView] = useState<Presentation | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const buffer = useRef<Capture | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  const dismissing = useRef(false);

  function save(dismiss = false): Promise<void> {
    clearTimeout(timer.current);
    const snapshot = buffer.current;
    if (!snapshot) return Promise.resolve();
    const task = queue.current.catch(() => {}).then(async () => {
      const saved = await api.save(snapshot.id, snapshot.content, snapshot.title || null, dismiss);
      if (buffer.current?.id === snapshot.id && buffer.current.content === snapshot.content && buffer.current.title === snapshot.title) {
        buffer.current = saved;
        setRecord(saved);
        setMessage('Saved');
      }
    });
    queue.current = task;
    return task;
  }

  async function dismiss() {
    if (dismissing.current) return;
    dismissing.current = true;
    setBusy(true);
    try {
      await save(true);
      buffer.current = null;
      setRecord(null);
    } catch (reason) { setMessage(`Could not save and close: ${String(reason)}`); }
    finally { dismissing.current = false; setBusy(false); }
  }

  function request(id: string) {
    requests.current = requests.current.catch(() => {}).then(async () => {
      setBusy(true);
      try {
        await save();
        const next = await api.get(id);
        const presentation = await api.showEditor(id);
        buffer.current = next;
        setRecord(next);
        setView(presentation);
        setMoving(false);
        setMessage('Saved');
        requestAnimationFrame(() => input.current?.focus());
      } finally { setBusy(false); }
    }).catch(reason => setMessage(`Could not open thought: ${String(reason)}`));
  }

  useEffect(() => {
    let stopped = false;
    const opened = listen<string>('editor-requested', event => { if (!stopped) request(event.payload); });
    const closed = listen('surface-close-requested', () => { if (!stopped) void dismiss(); });
    const quit = listen('quit-requested', () => {
      if (stopped) return;
      void save().then(() => api.quit()).catch(reason => setMessage(`Could not save before quitting: ${String(reason)}`));
    });
    void opened.then(() => api.pending()).then(id => { if (!stopped && id) request(id); }).catch(reason => setMessage(String(reason)));
    return () => {
      stopped = true;
      clearTimeout(timer.current);
      for (const pending of [opened, closed, quit]) void pending.then(unlisten => unlisten());
    };
  }, []);

  function edit(content: string, title: string | undefined) {
    if (!buffer.current) return;
    const next = { ...buffer.current, content, title };
    buffer.current = next;
    setRecord(next);
    setMessage('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save().catch(reason => setMessage(`Save failed: ${String(reason)}`)); }, 250);
  }

  async function presentation(opacity: number, alwaysOnTop: boolean) {
    if (!record || !view) return;
    try {
      await api.presentation(record.id, opacity, alwaysOnTop);
      setView({ ...view, opacity, always_on_top: alwaysOnTop });
    } catch (reason) { setMessage(String(reason)); }
  }

  async function move() {
    if (!buffer.current || busy) return;
    const id = buffer.current.id;
    setBusy(true);
    try {
      await save();
      const saved = await api.reassign(id, moveTo);
      if (buffer.current?.id === id) { buffer.current = saved; setRecord(saved); }
      setMoving(false);
      setMessage('Moved');
    } catch (reason) { setMessage(`Could not move: ${String(reason)}`); }
    finally { setBusy(false); }
  }

  if (!record) return <div className="editor-empty" role="status">{message}</div>;
  return <main className="capture-editor ht-surface"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) { if (moving) setMoving(false); else void dismiss(); }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); void save().catch(reason => setMessage(String(reason))); }
    }}>
    <header className="capture-editor-header">
      <button className="drag-grip" aria-label="Move thought" title="Drag to move"
        onMouseDown={event => { if (event.button === 0) void getCurrentWindow().startDragging().catch(reason => setMessage(String(reason))); }}>⠿</button>
      <input aria-label="Thought title" placeholder="Untitled thought" value={record.title || ''} readOnly={busy}
        onChange={event => edit(record.content, event.target.value || undefined)} />
      <button className="surface-close" aria-label="Save and close thought" title="Save and close (Esc)" disabled={busy} onClick={() => void dismiss()}>×</button>
    </header>
    <textarea ref={input} aria-label="Thought content" value={record.content} readOnly={busy} spellCheck
      onChange={event => edit(event.target.value, record.title)} />
    <footer className="capture-editor-footer">
      <span className="surface-destination" title={context?.containers.find(item => item.id === record.container_id)?.name || record.container_id}><span className="surface-pip" aria-hidden="true" /><span className="destination-name">{context?.containers.find(item => item.id === record.container_id)?.name || (record.container_id === 'waiting-room' ? 'Waiting Room' : 'Project')}</span></span>
      <span role="status">{message}</span>
      <div className="presentation-controls">
        <button disabled={busy} onClick={() => { setMoveTo(record.container_id); setMoving(true); }} aria-label="Move thought to another container">Move</button>
        <button title="Keep above other windows" aria-label="Keep above other windows" aria-pressed={view?.always_on_top ?? true}
          onClick={() => void presentation(view?.opacity ?? 0.95, !view?.always_on_top)}>Pin</button>
      </div>
      <button className="editor-resize" title="Resize" aria-label="Resize thought"
        onMouseDown={() => void getCurrentWindow().startResizeDragging('SouthEast').catch(reason => setMessage(String(reason)))}>◢</button>
    </footer>
    {moving && <form className="editor-move" aria-label="Move thought to a container" onSubmit={event => { event.preventDefault(); void move(); }}>
      <label htmlFor="move-container">Move to</label>
      <select id="move-container" value={moveTo} disabled={busy || !context} onChange={event => setMoveTo(event.target.value)}>
        {context?.containers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div><button type="submit" disabled={busy || !context}>Move</button><button type="button" disabled={busy} onClick={() => setMoving(false)}>Cancel</button></div>
      {contextError && <p role="alert">Could not load destinations: {contextError}</p>}
    </form>}
  </main>;
}
