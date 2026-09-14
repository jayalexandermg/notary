import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, Capture, captureLabel, Container } from '../lib/capture';
import { useCaptureContext } from '../hooks/useCaptureContext';
import DestinationRouter, { contextPath } from './DestinationRouter';

type Row = { kind: 'project'; item: Container } | { kind: 'capture'; item: Capture };
type Inspection = { id: string | null; rows: Row[]; preview: Capture | null; summary: string };
const DELETED = 'recently-deleted';

export default function AmbientAnchor() {
  const { context, contextError } = useCaptureContext();
  const contextRef = useRef(context); contextRef.current = context;
  const [mode, setMode] = useState<'ambient' | 'peek' | 'latched'>('ambient');
  const held = useRef(false);
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const active = useRef<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [routing, setRouting] = useState<Capture | null>(null);
  const routingRef = useRef<Capture | null>(null);
  const [utility, setUtility] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [purge, setPurge] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [height, setHeight] = useState(100);
  const panel = useRef<HTMLElement>(null);
  const hover = useRef<ReturnType<typeof setTimeout>>();
  const leave = useRef<ReturnType<typeof setTimeout>>();
  const dragStart = useRef<ReturnType<typeof setTimeout>>();
  const loadRevision = useRef(0), inspectRevision = useRef(0);
  const windowQueue = useRef<Promise<unknown>>(Promise.resolve());
  const windowRevision = useRef(0);
  const alive = useRef(true);
  const expanded = mode !== 'ambient';
  const containers = context?.containers || [];
  const current = containers.find(c => c.id === activeContext);
  const trail = contextPath(containers, activeContext);

  function latch() { held.current = true; clearTimeout(leave.current); setMode('latched'); }
  function clearInspection() { clearTimeout(hover.current); ++inspectRevision.current; setInspection(null); }
  function collapse() {
    clearTimeout(dragStart.current);
    held.current = false; ++loadRevision.current; clearTimeout(leave.current); clearInspection();
    setMode('ambient'); setUtility(false); setNaming(false); setPurge(null); setRouting(null); routingRef.current = null;
  }
  async function loadRows(id: string | null): Promise<Row[]> {
    const all = contextRef.current?.containers || [];
    if (id === DELETED) return (await api.deleted()).map(item => ({ kind: 'capture', item }));
    const children: Row[] = all.filter(c => (c.parent_id || null) === id).map(item => ({ kind: 'project', item }));
    if (!id) return children;
    return [...children, ...(await api.list(id)).map(item => ({ kind: 'capture' as const, item }))];
  }
  async function refresh(id: string | null) {
    if (active.current !== id) return;
    const version = ++loadRevision.current;
    try { const next = await loadRows(id); if (alive.current && version === loadRevision.current && active.current === id) setRows(next); }
    catch (error) { if (version === loadRevision.current) setError(String(error)); }
  }
  // The sole active-context writer. Inspection only owns inspection state.
  function navigate(id: string | null, deliberate = true) {
    if (id && id !== DELETED && !contextRef.current?.containers.some(c => c.id === id)) { setError('Context is unavailable'); return; }
    if (deliberate) latch();
    active.current = id; setActiveContext(id); clearInspection(); setRows([]); setUtility(false); setNaming(false); setPurge(null); setError('');
    setRouting(null); routingRef.current = null; void refresh(id);
  }
  function reveal(click = false) {
    clearTimeout(leave.current);
    if (click) latch(); else if (!held.current) setMode('peek');
    if (!expanded) navigate(null, false);
  }
  async function inspect(id: string) {
    const version = ++inspectRevision.current;
    try {
      const next = await loadRows(id);
      if (alive.current && version === inspectRevision.current && !routingRef.current) setInspection({ id, rows: next, preview: null, summary: '' });
    } catch (error) { if (version === inspectRevision.current) setError(String(error)); }
  }
  function hoverRow(row: Row, inside = false) {
    clearTimeout(hover.current);
    if (routingRef.current || active.current === DELETED) return;
    if (inside) {
      setInspection(value => value && ({ ...value, preview: row.kind === 'capture' ? row.item : null, summary: row.kind === 'project' ? row.item.name : '' }));
      return;
    }
    hover.current = setTimeout(() => {
      if (row.kind === 'project') void inspect(row.item.id);
      else { ++inspectRevision.current; setInspection({ id: null, rows: [], preview: row.item, summary: '' }); }
    }, 160);
  }
  async function engage(row: Row) {
    clearTimeout(hover.current); latch();
    if (row.kind === 'project') navigate(row.item.id);
    else { try { await api.engage(row.item.id); collapse(); } catch (error) { setError(String(error)); } }
  }
  function startRouting(capture: Capture) { latch(); clearInspection(); routingRef.current = capture; setRouting(capture); setUtility(false); setNaming(false); }
  function cancelRouting() { clearTimeout(dragStart.current); setRouting(null); routingRef.current = null; }
  async function move(id: string) {
    if (!routingRef.current) return;
    const record = routingRef.current;
    await api.reassign(record.id, id);
    cancelRouting(); await refresh(active.current);
  }
  useLayoutEffect(() => {
    if (!panel.current) return;
    const element = panel.current;
    const measure = () => setHeight(Math.min(320, Math.ceil(element.getBoundingClientRect().height)));
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, [expanded]);
  useEffect(() => {
    const version = ++windowRevision.current;
    windowQueue.current = windowQueue.current.catch(() => {}).then(() => {
      if (version === windowRevision.current) return api.expand(expanded, mode === 'latched', height, Boolean(inspection));
    }).catch(error => setError(String(error)));
  }, [expanded, mode, height, Boolean(inspection)]);
  useEffect(() => {
    alive.current = true;
    const target = { target: 'anchor' };
    const subscriptions = [listen('return-to-ambient', collapse, target), listen('surface-close-requested', collapse, target),
      listen('browse-requested', () => { latch(); navigate(null); }, target), listen<string>('runtime-error', e => setError(e.payload), target),
      listen('captures-changed', () => { clearInspection(); void refresh(active.current); })];
    const blur = () => collapse();
    const dragEnd = () => cancelRouting();
    window.addEventListener('blur', blur); window.addEventListener('dragend', dragEnd);
    return () => { alive.current = false; ++loadRevision.current; ++inspectRevision.current; clearTimeout(hover.current); clearTimeout(leave.current); clearTimeout(dragStart.current);
      window.removeEventListener('blur', blur); window.removeEventListener('dragend', dragEnd); for (const pending of subscriptions) void pending.then(unlisten => unlisten()); };
  }, []);
  useEffect(() => { if (expanded && activeContext === null && !rows.length && context) void refresh(null); }, [context, expanded, activeContext]);

  async function create() {
    if (!name.trim() || busy) return; setBusy(true); setError('');
    try { const project = await api.createProject(name, current?.kind === 'project' ? current.id : null); setName(''); setNaming(false);
      const fresh = await api.context(); contextRef.current = fresh; await refresh(active.current);
      if (!fresh.containers.some(c => c.id === project.id)) setError('Created Project is not yet available');
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  }
  function renderRow(row: Row, inside = false) {
    const label = row.kind === 'project' ? row.item.name : captureLabel(row.item);
    return <div key={row.item.id} data-row-id={row.item.id} data-row-kind={row.kind} className={`context-row ${row.kind === 'project' && row.item.kind === 'waiting_room' ? 'waiting-row' : ''}`}
      draggable={row.kind === 'capture' && activeContext !== DELETED}
      onDragStart={event => { if (row.kind === 'capture') { event.dataTransfer.setData('text/plain', row.item.id); event.dataTransfer.effectAllowed = 'move'; clearTimeout(dragStart.current); dragStart.current = setTimeout(() => startRouting(row.item as Capture), 0); } }}
      onMouseEnter={() => hoverRow(row, inside)} onMouseLeave={() => clearTimeout(hover.current)}>
      <button title={label} onFocus={() => hoverRow(row, inside)} onClick={() => void engage(row)}><span className="row-marker">{row.kind === 'project' ? '›' : '·'}</span><span>{label}</span></button>
      {row.kind === 'capture' && <button className="row-action move-action" title="Move" aria-label={`Move ${label}`} onClick={() => startRouting(row.item)}>Move</button>}
      {inside && row.kind === 'project' && <button className="row-action" title={`Inspect ${label}`} aria-label={`Inspect ${label}`} onClick={() => { latch(); void inspect(row.item.id); }}>›</button>}
    </div>;
  }
  return <main className={`ambient-root mode-${mode}`} data-mode={mode} data-active-context={activeContext || 'root'} data-inspection-path={inspection?.id || ''}
    onMouseEnter={() => clearTimeout(leave.current)} onMouseLeave={() => { clearTimeout(hover.current); if (!held.current) leave.current = setTimeout(collapse, 300); }}
    onPointerDown={event => { if (event.target === event.currentTarget) collapse(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); if (purge) setPurge(null); else if (routing) cancelRouting(); else if (utility) setUtility(false); else collapse(); } }}>
    <button className="ambient-mark note-card" title="HoverThought" aria-label="Retrieve thoughts" onMouseEnter={() => { if (!expanded) reveal(); }} onClick={() => reveal(true)}>H</button>
    {expanded && <section ref={panel} className="ambient-panel v1-panel note-card" aria-label="Thought retrieval" onPointerDown={event => {
      latch(); const target = event.target as HTMLElement;
      if (!target.closest('.utility-popover') && !target.closest('[aria-label="Utilities"]')) setUtility(false);
    }}>
      <nav className="context-trail" aria-label="Active context path"><button aria-label="All contexts" onClick={() => navigate(null)}>H</button>
        {activeContext === DELETED ? <span>Recently Deleted</span> : trail.map(c => <button key={c.id} title={c.name} onClick={() => navigate(c.id)}>{c.name}</button>)}
      </nav>
      {routing ? <DestinationRouter containers={containers} source={routing.container_id} onSelect={move} onCancel={cancelRouting} allowCreate /> : <div className="active-list" aria-label="Active context list" key={activeContext || 'root'}>
        {activeContext === DELETED ? rows.map(row => row.kind === 'capture' && <div className="deleted-row" key={row.item.id}><span title={captureLabel(row.item)}>{captureLabel(row.item)}</span><button disabled={busy} onClick={() => {
          setBusy(true); void api.restore(row.item.id).then(restored => { setError(restored.container_id !== row.item.container_id ? 'Restored to Waiting Room: original Project is unavailable.' : 'Restored'); return refresh(DELETED); }).catch(error => setError(String(error))).finally(() => setBusy(false));
        }}>Restore</button><button disabled={busy} onClick={() => setPurge(row.item)}>Delete forever</button></div>) : rows.map(row => renderRow(row))}
        {!rows.length && <p className="ambient-empty">{activeContext === DELETED ? 'No deleted captures.' : 'No captures or Projects here yet.'}</p>}
        {naming && <form className="inline-project" onSubmit={event => { event.preventDefault(); void create(); }}><input aria-label="Project name" placeholder="Project name…" autoFocus value={name} disabled={busy} onChange={event => setName(event.target.value)} /><button disabled={busy || !name.trim()}>Create</button></form>}
      </div>}
      {!routing && <footer className="v1-controls"><button aria-label="Utilities" title="Utilities" onClick={() => { latch(); clearInspection(); setUtility(!utility); }}>…</button>
        {current?.kind === 'project' && <><button disabled={busy} onClick={() => { latch(); setBusy(true); void api.setPrimary(context?.primary_container_id === current.id ? null : current.id).catch(error => setError(String(error))).finally(() => setBusy(false)); }}>{context?.primary_container_id === current.id ? 'Clear Primary' : 'Make Primary'}</button>
          <button disabled={busy} onClick={() => { latch(); void api.newNote(current.id).then(collapse).catch(error => setError(String(error))); }}>+ Note</button></>}
        {(activeContext === null || current?.kind === 'project') && <button onClick={() => { latch(); clearInspection(); setNaming(!naming); setName(''); }}>+ Project</button>}
      </footer>}
      {(error || contextError) && <p className="v1-error" role="status" title={error || contextError || ''}>{error || contextError}</p>}
      {utility && <div className="utility-popover" role="menu"><button role="menuitem" onClick={() => navigate(DELETED)}>Recently Deleted</button></div>}
      {purge && <div className="utility-popover purge-confirm" role="alertdialog" aria-label="Confirm permanent deletion"><p>Permanently delete “{captureLabel(purge)}”?</p><button disabled={busy} onClick={() => { setBusy(true); void api.purge(purge.id, true).then(() => { setPurge(null); return refresh(DELETED); }).catch(error => setError(String(error))).finally(() => setBusy(false)); }}>Delete permanently</button><button disabled={busy} onClick={() => setPurge(null)}>Cancel</button></div>}
    </section>}
    {expanded && inspection && <aside className="v1-inspector note-card" aria-label="Inspector" data-inspector-context={inspection.id || 'capture'} onPointerDown={latch}>
      <nav className="context-trail" aria-label="Inspection path">{contextPath(containers, inspection.id).map(c => <button key={c.id} title={c.name} onClick={() => { latch(); void inspect(c.id); }}>{c.name}</button>)}</nav>
      <div className="inspector-list" aria-label="Inspected children">{inspection.rows.map(row => renderRow(row, true))}</div>
      <article className="inspector-preview" aria-label="Thought preview">{inspection.preview ? <><strong>{captureLabel(inspection.preview)}</strong><p>{inspection.preview.content}</p><small>{new Date(inspection.preview.created_at).toLocaleString()}</small></> : <p>{inspection.summary || 'Hover a capture to preview · click a Project to enter'}</p>}</article>
    </aside>}
  </main>;
}
