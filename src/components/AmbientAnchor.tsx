import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, Capture, captureLabel, Container, LegacyNote, ShortcutStatus } from '../lib/capture';
import { useCaptureContext } from '../hooks/useCaptureContext';

type Slot = 0 | 1;
type Row = { kind: 'context'; item: Container } | { kind: 'capture'; item: Capture } | { kind: 'legacy'; item: LegacyNote } | { kind: 'legacy-root' };
type Pane = { kind: 'empty' | 'loading'; title: string }
  | { kind: 'list'; title: string; rows: Row[] }
  | { kind: 'preview'; title: string; record: Capture | LegacyNote; legacy: boolean }
  | { kind: 'project'; title: string; parentId: string | null }
  | { kind: 'shortcut'; title: string };
const EMPTY: Pane = { kind: 'empty', title: 'Hover a context or thought' };
const other = (slot: Slot): Slot => slot === 0 ? 1 : 0;

export default function AmbientAnchor() {
  const { context, contextError } = useCaptureContext();
  const contextRef = useRef(context);
  contextRef.current = context;
  const [mode, setMode] = useState<'ambient' | 'reveal' | 'browse'>('ambient');
  const [panes, setPanes] = useState<[Pane, Pane]>([EMPTY, EMPTY]);
  const panesRef = useRef(panes);
  const revisions = useRef([0, 0]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<LegacyNote[]>([]);
  const legacyRef = useRef(legacy);
  legacyRef.current = legacy;
  const [error, setError] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<ShortcutStatus | null>(null);
  const [binding, setBinding] = useState('');
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const held = useRef(false);
  const hover = useRef<ReturnType<typeof setTimeout>>();
  const leave = useRef<ReturnType<typeof setTimeout>>();
  const stopped = useRef(false);
  const windowUpdates = useRef<Promise<unknown>>(Promise.resolve());
  const windowRevision = useRef(0);
  const expanded = mode !== 'ambient';
  const focused = expanded && held.current;

  function put(slot: Slot, pane: Pane) {
    ++revisions.current[slot];
    const next: [Pane, Pane] = [...panesRef.current];
    next[slot] = pane;
    panesRef.current = next;
    setPanes(next);
  }

  useEffect(() => {
    const revision = ++windowRevision.current;
    // One footprint at every depth. Hover never resizes or re-centers the window.
    windowUpdates.current = windowUpdates.current.catch(() => {}).then(() => {
      if (windowRevision.current === revision) return api.expand(expanded, focused, 420);
    }).catch(reason => setError(String(reason)));
  }, [expanded, focused]);

  function root() {
    clearTimeout(hover.current);
    setCurrentId(null);
    const roots: Row[] = (contextRef.current?.containers || []).filter(c => !c.parent_id).map(item => ({ kind: 'context', item }));
    if (legacyRef.current.length) roots.push({ kind: 'legacy-root' });
    put(0, { kind: 'list', title: 'Contexts', rows: roots });
    put(1, EMPTY);
  }

  function collapse() {
    held.current = false;
    clearTimeout(hover.current); clearTimeout(leave.current);
    ++revisions.current[0]; ++revisions.current[1];
    setMode('ambient');
  }

  function hold() { held.current = true; clearTimeout(leave.current); setMode('browse'); }
  function reveal(deliberate = false) {
    clearTimeout(leave.current);
    if (deliberate) hold(); else setMode(held.current ? 'browse' : 'reveal');
    if (mode === 'ambient') root();
  }

  async function children(slot: Slot, container: Container) {
    const target = other(slot);
    // Freeze the source list, including its scroll position. Only the OTHER slot
    // changes, so different child counts, long previews and sibling hovers cannot
    // relocate the current pointer or keyboard target.
    setCurrentId(container.id);
    put(target, { kind: 'loading', title: container.name });
    const revision = revisions.current[target];
    const descendants: Row[] = (contextRef.current?.containers || []).filter(c => c.parent_id === container.id).map(item => ({ kind: 'context', item }));
    try {
      const records = await api.list(container.id);
      if (stopped.current || revisions.current[target] !== revision) return;
      put(target, { kind: 'list', title: container.name, rows: [...descendants, ...records.map(item => ({ kind: 'capture' as const, item }))] });
    } catch (reason) {
      if (!stopped.current && revisions.current[target] === revision) put(target, { kind: 'empty', title: `Could not load: ${String(reason)}` });
    }
  }

  function inspect(slot: Slot, row: Row) {
    clearTimeout(hover.current);
    if (row.kind === 'context') void children(slot, row.item);
    else if (row.kind === 'legacy-root') {
      setCurrentId(null);
      put(other(slot), { kind: 'list', title: 'Legacy notes', rows: legacyRef.current.map(item => ({ kind: 'legacy', item })) });
    } else put(other(slot), { kind: 'preview', title: captureLabel(row.item), record: row.item, legacy: row.kind === 'legacy' });
  }

  function hoverRow(slot: Slot, row: Row) {
    clearTimeout(hover.current);
    hover.current = setTimeout(() => inspect(slot, row), 180);
  }

  function engage(slot: Slot, row: Row) {
    hold(); clearTimeout(hover.current);
    if (row.kind === 'capture') void api.engage(row.item.id).catch(reason => setError(String(reason)));
    else inspect(slot, row);
  }

  const current = context?.containers.find(c => c.id === currentId);
  function siblings() {
    clearTimeout(hover.current);
    const selected = contextRef.current?.containers.find(c => c.id === currentId);
    const rows: Row[] = (contextRef.current?.containers || []).filter(c => (c.parent_id || null) === (selected?.parent_id || null)).map(item => ({ kind: 'context', item }));
    hold(); put(0, { kind: 'list', title: 'Sibling contexts', rows }); put(1, EMPTY);
  }

  function ancestors() {
    clearTimeout(hover.current);
    const rows: Row[] = [];
    const seen = new Set<string>();
    let selected = contextRef.current?.containers.find(c => c.id === currentId);
    while (selected && !seen.has(selected.id)) {
      seen.add(selected.id); rows.unshift({ kind: 'context', item: selected });
      selected = contextRef.current?.containers.find(c => c.id === selected?.parent_id);
    }
    hold(); put(0, { kind: 'list', title: 'Current path', rows }); put(1, EMPTY);
  }

  useEffect(() => {
    stopped.current = false;
    void api.legacy().then(notes => { if (!stopped.current) setLegacy(notes); }).catch(reason => setError(String(reason)));
    void api.shortcut().then(status => { if (!stopped.current) { setShortcut(status); setBinding(status.binding); } }).catch(reason => setError(String(reason)));
    const subscriptions = [
      listen('return-to-ambient', collapse), listen('surface-close-requested', collapse),
      listen('browse-requested', () => { hold(); root(); }),
      listen<string>('runtime-error', event => setError(event.payload)),
    ];
    window.addEventListener('blur', collapse);
    return () => {
      stopped.current = true; ++revisions.current[0]; ++revisions.current[1];
      clearTimeout(hover.current); clearTimeout(leave.current);
      for (const subscription of subscriptions) void subscription.then(unlisten => unlisten(), () => {});
      window.removeEventListener('blur', collapse);
    };
  }, []);

  // Startup may reveal before context finishes loading. Refresh only the empty
  // initial root; never reorder a populated list under an engaged pointer.
  useEffect(() => {
    if (expanded && !currentId && panesRef.current[0].kind === 'list' && !panesRef.current[0].rows.length) root();
  }, [context, legacy, expanded, currentId]);

  async function primary() {
    if (!current || busy) return;
    setBusy(true); setError(null);
    try { await api.setPrimary(context?.primary_container_id === current.id ? null : current.id); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  async function createProject(parentId: string | null) {
    if (busy || !projectName.trim()) return;
    setBusy(true); setError(null);
    try {
      const project = await api.createProject(projectName, parentId);
      setProjectName('');
      // Deliberate form submission can recompose both slots; no hover causes it.
      put(0, { kind: 'list', title: parentId ? 'Created context' : 'Created project', rows: [{ kind: 'context', item: project }] });
      await children(0, project);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  function renderPane(pane: Pane, slot: Slot) {
    return <section key={slot} className="spatial-slot" aria-label={slot === 0 ? 'Navigation area one' : 'Navigation area two'} data-slot={slot}>
      <div className="spatial-heading" title={pane.title}>{pane.title}</div>
      {pane.kind === 'list' && <div className="spatial-rows" key={pane.title}>
        {pane.rows.map(row => {
          const key = row.kind === 'legacy-root' ? 'legacy-root' : row.item.id;
          const name = row.kind === 'legacy-root' ? 'Legacy notes' : row.kind === 'context' ? row.item.name : captureLabel(row.item);
          return <button key={key} data-row-id={key} data-row-kind={row.kind} title={name}
            onMouseEnter={() => hoverRow(slot, row)} onMouseLeave={() => clearTimeout(hover.current)}
            onFocus={() => inspect(slot, row)} onClick={() => engage(slot, row)}>
            <span>{name}</span><small>{row.kind === 'context' ? row.item.capture_count : row.kind === 'legacy' ? 'Read only' : '›'}</small>
          </button>;
        })}
        {!pane.rows.length && <p className="ambient-empty">No thoughts or child contexts yet.</p>}
      </div>}
      {pane.kind === 'preview' && <article className="spatial-preview" aria-label="Thought preview">
        <p>{pane.record.content}</p><small>{new Date(pane.record.created_at).toLocaleString()}{pane.legacy ? ' · Read only' : ''}</small>
        {!pane.legacy && <button onClick={() => void api.engage(pane.record.id).catch(reason => setError(String(reason)))}>Open thought</button>}
      </article>}
      {pane.kind === 'loading' && <p className="ambient-empty" role="status">Loading…</p>}
      {pane.kind === 'project' && <form className="spatial-form" onSubmit={event => { event.preventDefault(); void createProject(pane.parentId); }}>
        <label htmlFor="project-name">{pane.parentId ? 'Context name' : 'Project name'}</label>
        <input id="project-name" value={projectName} onChange={event => setProjectName(event.target.value)} disabled={busy} autoFocus />
        <button disabled={busy || !projectName.trim()}>Create</button>
      </form>}
      {pane.kind === 'shortcut' && <form className="spatial-form" onSubmit={event => {
        event.preventDefault(); void api.setShortcut(binding).then(status => { setShortcut(status); setError(null); }).catch(reason => setError(String(reason)));
      }}><label htmlFor="capture-shortcut">Global capture shortcut</label><input id="capture-shortcut" value={binding} onChange={event => setBinding(event.target.value)} /><button>Save shortcut</button></form>}
    </section>;
  }

  return <main className={`ambient-root mode-${mode}`} data-mode={mode}
    onMouseEnter={() => clearTimeout(leave.current)}
    onMouseLeave={() => { clearTimeout(hover.current); if (!held.current) leave.current = setTimeout(collapse, 300); }}
    onKeyDown={event => { if (event.key === 'Escape') collapse(); }}>
    <button className="ambient-mark note-card" aria-label="Retrieve thoughts" title="HoverThought"
      onMouseEnter={() => { if (!expanded) reveal(); }} onClick={() => reveal(true)}>
      H{(error || contextError || shortcut?.error) && <span className="anchor-error-dot" aria-label="Attention needed" />}
    </button>
    {expanded && <section className="ambient-panel spatial-panel note-card" aria-label="Thought retrieval" onPointerDown={hold}>
      <header className="spatial-path">
        <button onClick={() => { hold(); root(); }} aria-label="All contexts">H</button>
        <button onClick={ancestors} disabled={!current} aria-label="Ancestor contexts" title="Current path">…</button>
        <button onClick={siblings} aria-label="Sibling contexts" title={current ? `Siblings of ${current.name}` : 'Root contexts'}>{current?.name || 'Contexts'}</button>
        <button onClick={collapse} aria-label="Close retrieval">×</button>
      </header>
      <div className="spatial-content">{panes.map((pane, slot) => renderPane(pane, slot as Slot))}</div>
      <footer className="spatial-controls">
        <button disabled={busy || current?.kind !== 'project'} onClick={() => void primary()} aria-pressed={Boolean(current && context?.primary_container_id === current.id)}>{current && context?.primary_container_id === current.id ? 'Clear Primary' : 'Make Primary'}</button>
        <button onClick={() => { hold(); clearTimeout(hover.current); setProjectName(''); put(1, { kind: 'project', title: current?.kind === 'project' ? `Inside ${current.name}` : 'New project', parentId: current?.kind === 'project' ? current.id : null }); }}>{current?.kind === 'project' ? 'New child context' : 'New project'}</button>
        <button aria-label="Capture shortcut" onClick={() => { hold(); clearTimeout(hover.current); put(1, { kind: 'shortcut', title: 'Capture shortcut' }); }}>⌨</button>
      </footer>
      <div className="spatial-error" role="status" title={error || contextError || shortcut?.error || ''}>{error || contextError || shortcut?.error}</div>
    </section>}
  </main>;
}
