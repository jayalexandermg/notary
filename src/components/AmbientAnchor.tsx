import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, Capture, captureLabel, LegacyNote, ShortcutStatus } from '../lib/capture';
import { useCaptureContext } from '../hooks/useCaptureContext';

type Layer = 'contexts' | 'container' | 'legacy' | 'shortcut' | 'project';
type Mode = 'ambient' | 'reveal' | 'browse' | 'preview';

export default function AmbientAnchor() {
  const { context, contextError } = useCaptureContext();
  const [containerId, setContainerId] = useState('waiting-room');
  const activeContainer = useRef('waiting-room');
  const refreshGeneration = useRef(0);
  const [projectName, setProjectName] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('ambient');
  const [layer, setLayer] = useState<Layer>('contexts');
  const [records, setRecords] = useState<Capture[]>([]);
  const [legacy, setLegacy] = useState<LegacyNote[]>([]);
  const [preview, setPreview] = useState<Capture | LegacyNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<ShortcutStatus | null>(null);
  const [binding, setBinding] = useState('');
  const held = useRef(false);
  const windowUpdates = useRef<Promise<unknown>>(Promise.resolve());
  const windowRevision = useRef(0);
  const leave = useRef<ReturnType<typeof setTimeout>>();
  const hover = useRef<ReturnType<typeof setTimeout>>();
  const expanded = mode !== 'ambient';
  const focused = expanded && held.current;

  useEffect(() => {
    const revision = ++windowRevision.current;
    const count = layer === 'legacy' ? legacy.length : records.length;
    const height = layer === 'contexts' ? Math.min(420, 180 + ((context?.containers.length || 1) + (legacy.length ? 1 : 0)) * 44)
      : layer === 'shortcut' || layer === 'project' ? 320 : Math.min(420, 180 + Math.min(count, 6) * 44 + (count ? 150 : 0));
    // Reserve preview space: resizing a centered native window on row hover
    // moves that row away from the pointer before the click can land.
    // Native resize/focus consists of several dispatches. Keep one ordered
    // writer, otherwise a late collapse can overwrite a newer project reveal.
    windowUpdates.current = windowUpdates.current.catch(() => {}).then(() => {
      if (windowRevision.current === revision) return api.expand(expanded, focused, height);
    }).catch(reason => setError(String(reason)));
  }, [expanded, focused, layer, records.length, legacy.length, context?.containers.length]);

  async function refresh() {
    const generation = ++refreshGeneration.current;
    const id = activeContainer.current;
    setRecordsLoading(true);
    try {
      const [captures, notes, status] = await Promise.all([api.list(id), api.legacy(), api.shortcut()]);
      if (generation !== refreshGeneration.current) return;
      setRecords(captures); setLegacy(notes); setShortcut(status); setBinding(status.binding);
      setPreview(current => current && layerRef.current === 'container' ? captures.find(item => item.id === current.id) || null : current);
    } catch (reason) { if (generation === refreshGeneration.current) setError(String(reason)); }
    finally { if (generation === refreshGeneration.current) setRecordsLoading(false); }
  }

  const layerRef = useRef<Layer>('contexts');

  function collapse() {
    held.current = false;
    clearTimeout(leave.current); clearTimeout(hover.current);
    setMode('ambient'); setLayer('contexts'); setPreview(null);
    layerRef.current = 'contexts';
  }

  function reveal(hold = false) {
    clearTimeout(leave.current);
    if (hold) held.current = true;
    setMode(held.current ? 'browse' : 'reveal');
    void refresh();
  }

  function navigate(next: Layer, hold = false, id?: string) {
    if (id && id !== activeContainer.current) {
      activeContainer.current = id;
      setContainerId(id);
      setRecords([]);
    }
    if (hold) reveal(true);
    setPreview(null); setLayer(next);
    layerRef.current = next;
    if (next === 'container') void refresh();
  }

  useEffect(() => {
    let stopped = false;
    void refresh();
    const changed = listen('captures-changed', () => { if (!stopped) void refresh(); });
    const ambient = listen('return-to-ambient', () => { if (!stopped) collapse(); });
    const browse = listen('browse-requested', () => { if (!stopped) reveal(true); });
    const failed = listen<string>('runtime-error', event => { if (!stopped) setError(event.payload); });
    const closed = listen('surface-close-requested', () => { if (!stopped) collapse(); });
    const blur = () => collapse();
    window.addEventListener('blur', blur);
    return () => {
      stopped = true;
      clearTimeout(leave.current); clearTimeout(hover.current);
      for (const subscription of [changed, ambient, browse, failed, closed]) void subscription.then(unlisten => unlisten());
      window.removeEventListener('blur', blur);
    };
  }, []);

  function hoverLayer(next: Layer, id?: string) {
    clearTimeout(hover.current);
    hover.current = setTimeout(() => navigate(next, false, id), 250);
  }

  const selectedContainer = context?.containers.find(item => item.id === containerId);

  async function primary() {
    if (projectBusy) return;
    setProjectBusy(true); setError(null);
    try { await api.setPrimary(context?.primary_container_id === containerId ? null : containerId); }
    catch (reason) { setError(String(reason)); }
    finally { setProjectBusy(false); }
  }

  async function createProject() {
    if (projectBusy || !projectName.trim()) return;
    setProjectBusy(true); setError(null);
    try {
      const project = await api.createProject(projectName);
      setProjectName('');
      navigate('container', true, project.id);
    } catch (reason) { setError(String(reason)); }
    finally { setProjectBusy(false); }
  }

  return <main className={`ambient-root mode-${mode}`} data-mode={mode}
    onMouseEnter={() => clearTimeout(leave.current)}
    onMouseLeave={() => { clearTimeout(hover.current); if (!held.current) leave.current = setTimeout(collapse, 300); }}
    onKeyDown={event => { if (event.key === 'Escape') collapse(); }}>
    <button className="ambient-mark note-card" aria-label="Retrieve thoughts" title="HoverThought"
      onMouseEnter={() => { if (mode === 'ambient') reveal(); }} onClick={() => reveal(true)}>
      H{(error || shortcut?.error) && <span className="anchor-error-dot" aria-label="Attention needed" />}
    </button>
    {mode !== 'ambient' && <section className="ambient-panel note-card" aria-label="Thought retrieval">
      <header className="ambient-path">
        <button onClick={() => navigate('contexts', true)} aria-label="All contexts">H</button>
        {layer !== 'contexts' && <><span>/</span><span>{layer === 'container' ? selectedContainer?.name || 'Project' : layer === 'legacy' ? 'Legacy notes' : layer === 'project' ? 'New project' : 'Capture shortcut'}</span></>}
        <button className="ambient-dismiss" aria-label="Close retrieval" onClick={collapse}>×</button>
      </header>
      {(error || contextError || shortcut?.error) && <p className="capture-error" role="alert">{error || contextError || shortcut?.error}</p>}
      {layer === 'contexts' && <div className="ambient-items">
        {context?.containers.map(item => <button key={item.id} onMouseEnter={() => hoverLayer('container', item.id)} onMouseLeave={() => clearTimeout(hover.current)} onClick={() => navigate('container', true, item.id)}>
          <span>{item.name}</span>{context.primary_container_id === item.id && <small>Primary</small>}<small>{item.capture_count}</small>
        </button>)}
        {legacy.length > 0 && <button onMouseEnter={() => hoverLayer('legacy')} onMouseLeave={() => clearTimeout(hover.current)} onClick={() => navigate('legacy', true)}>
          <span>Legacy notes</span><small>{legacy.length}</small>
        </button>}
        <button className="shortcut-link" onClick={() => navigate('shortcut', true)}>Capture shortcut <small>⌨</small></button>
        <button className="shortcut-link" onClick={() => navigate('project', true)}>New project <small>+</small></button>
      </div>}
      {layer === 'container' && selectedContainer?.kind === 'project' && <div className="project-route">
        <span>{context?.primary_container_id === containerId ? 'New captures arrive here' : 'Use for new captures'}</span>
        <button disabled={projectBusy} aria-pressed={context?.primary_container_id === containerId} onClick={() => void primary()}>{context?.primary_container_id === containerId ? 'Clear Primary' : 'Make Primary'}</button>
      </div>}
      {(layer === 'container' || layer === 'legacy') && <>
        <div className="ambient-items capture-list">
          {(layer === 'container' ? records : legacy).map(record => <button key={record.id}
            onMouseEnter={() => { setPreview(record); setMode('preview'); }}
            onPointerMove={() => { if (preview?.id !== record.id) { setPreview(record); setMode('preview'); } }}
            onFocus={() => { setPreview(record); setMode('preview'); }}
            onClick={() => {
              if (layer === 'container') void api.engage(record.id).catch(reason => setError(String(reason)));
              else { setPreview(record); reveal(true); }
            }}><span>{captureLabel(record)}</span><small>{layer === 'container' ? '›' : ''}</small></button>)}
          {!(layer === 'container' ? records : legacy).length && <p className="ambient-empty">{recordsLoading ? 'Loading…' : 'No thoughts here yet.'}</p>}
        </div>
        {preview && <article className="capture-preview" aria-label="Thought preview">
          <p>{preview.content}</p>
          <small>{new Date(preview.created_at).toLocaleString()}{layer === 'legacy' ? ' · Read only' : ''}</small>
        </article>}
      </>}
      {layer === 'project' && <form className="capture-shortcut" onSubmit={event => { event.preventDefault(); void createProject(); }}>
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" value={projectName} onChange={event => setProjectName(event.target.value)} disabled={projectBusy} autoFocus />
        <button type="submit" disabled={projectBusy || !projectName.trim()}>Create project</button>
      </form>}
      {layer === 'shortcut' && <form className="capture-shortcut" onSubmit={event => {
        event.preventDefault();
        void api.setShortcut(binding).then(status => { setShortcut(status); setError(null); }).catch(reason => setError(String(reason)));
      }}>
        <label htmlFor="capture-shortcut">Global capture shortcut</label>
        <input id="capture-shortcut" value={binding} onChange={event => setBinding(event.target.value)} />
        <p>Use Ctrl, Alt, Shift or Command with a letter, number or Space.</p>
        <button type="submit">Save shortcut</button>
        <span role="status">{shortcut?.registered ? 'Registered' : 'Choose an available shortcut'}</span>
      </form>}
    </section>}
  </main>;
}
