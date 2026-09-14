import { useEffect, useRef, useState } from 'react';
import { api, Container } from '../lib/capture';

export function contextPath(containers: Container[], id: string | null): Container[] {
  const path: Container[] = [], seen = new Set<string>();
  let current = containers.find(c => c.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id); path.unshift(current); current = containers.find(c => c.id === current?.parent_id);
  }
  return path;
}

export default function DestinationRouter({ containers, source, onSelect, onCancel, allowCreate = false }: {
  containers: Container[]; source?: string; onSelect: (id: string) => Promise<void> | void; onCancel: () => void; allowCreate?: boolean;
}) {
  const [parent, setParent] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hover = useRef<ReturnType<typeof setTimeout>>();
  const createdDestination = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(hover.current), []);
  const path = contextPath(containers, parent);
  const rows = containers.filter(c => (c.parent_id || null) === parent);
  async function select(id: string) {
    if (busy || id === source) return;
    setBusy(true); setError(''); clearTimeout(hover.current);
    try { await onSelect(id); } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  function enter(id: string | null) { clearTimeout(hover.current); hover.current = undefined; setParent(id); setNaming(false); createdDestination.current = null; }
  return <section className="destination-router" aria-label="Destination router" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
  }}>
    <nav className="context-trail" aria-label="Destination path"><button onClick={() => enter(null)}>H</button>{path.map(c => <button key={c.id} title={c.name} onClick={() => enter(c.id)}>{c.name}</button>)}</nav>
    <div className="destination-list">
      {parent && <button className="route-current" disabled={busy || parent === source} onClick={() => void select(parent)}
        onDragOver={event => { if (parent !== source) event.preventDefault(); }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); void select(parent); }}>Use this Project · {path[path.length - 1]?.name}</button>}
      {rows.map(c => <div key={c.id} className="context-row" data-destination={c.id}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = c.id === source ? 'none' : 'move'; if (containers.some(child => child.parent_id === c.id) && !hover.current) hover.current = setTimeout(() => { hover.current = undefined; enter(c.id); }, 450); }}
        onDragLeave={() => { clearTimeout(hover.current); hover.current = undefined; }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); void select(c.id); }}>
        <button disabled={busy || c.id === source} title={c.name} onClick={() => void select(c.id)}><span className="row-marker">›</span><span>{c.name}</span></button>
        {containers.some(child => child.parent_id === c.id) && <button className="row-action" aria-label={`Destinations inside ${c.name}`} disabled={busy} onClick={() => enter(c.id)}>›</button>}
      </div>)}
      {allowCreate && (naming ? <form className="inline-project" onSubmit={event => {
        event.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError('');
        void (async () => {
          if (!createdDestination.current) createdDestination.current = (await api.createProject(name, parent)).id;
          await onSelect(createdDestination.current);
        })().catch(error => setError(String(error))).finally(() => setBusy(false));
      }}><input aria-label="New destination Project name" placeholder="Project name…" autoFocus value={name} disabled={busy || Boolean(createdDestination.current)} onChange={event => setName(event.target.value)} /><button disabled={busy || !name.trim()}>Create & move</button></form>
        : <button onClick={() => setNaming(true)} disabled={busy}>+ New Project</button>)}
    </div>
    {error && <p role="alert">{error}</p>}
    <button className="router-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
  </section>;
}

