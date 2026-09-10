import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, Capture, captureLabel, LegacyNote, ShortcutStatus } from '../lib/capture';

type Layer = 'contexts' | 'waiting' | 'legacy' | 'shortcut';
type Mode = 'ambient' | 'reveal' | 'browse' | 'preview';

export default function AmbientAnchor() {
  const [mode, setMode] = useState<Mode>('ambient');
  const [layer, setLayer] = useState<Layer>('contexts');
  const [records, setRecords] = useState<Capture[]>([]);
  const [legacy, setLegacy] = useState<LegacyNote[]>([]);
  const [preview, setPreview] = useState<Capture | LegacyNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<ShortcutStatus | null>(null);
  const [binding, setBinding] = useState('');
  const held = useRef(false);
  const leave = useRef<ReturnType<typeof setTimeout>>();
  const hover = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (mode === 'ambient') return;
    const count = layer === 'legacy' ? legacy.length : records.length;
    const height = layer === 'contexts' ? (legacy.length ? 220 : 180)
      : layer === 'shortcut' ? 320 : Math.min(420, 100 + Math.min(count, 6) * 44 + (preview ? 150 : 0));
    void api.expand(true, held.current, height).catch(reason => setError(String(reason)));
  }, [mode, layer, preview?.id, records.length, legacy.length]);

  async function refresh() {
    try {
      const [captures, notes, status] = await Promise.all([api.list(), api.legacy(), api.shortcut()]);
      setRecords(captures); setLegacy(notes); setShortcut(status); setBinding(status.binding);
    } catch (reason) { setError(String(reason)); }
  }

  function collapse() {
    held.current = false;
    clearTimeout(leave.current); clearTimeout(hover.current);
    setMode('ambient'); setLayer('contexts'); setPreview(null);
    void api.expand(false).catch(reason => setError(String(reason)));
  }

  function reveal(hold = false) {
    clearTimeout(leave.current);
    if (hold) held.current = true;
    setMode(held.current ? 'browse' : 'reveal');
    void api.expand(true, held.current).catch(reason => setError(String(reason)));
    void refresh();
  }

  function navigate(next: Layer, hold = false) {
    if (hold) reveal(true);
    setPreview(null); setLayer(next);
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

  function hoverLayer(next: Layer) {
    clearTimeout(hover.current);
    hover.current = setTimeout(() => navigate(next), 250);
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
        {layer !== 'contexts' && <><span>/</span><span>{layer === 'waiting' ? 'Waiting Room' : layer === 'legacy' ? 'Legacy notes' : 'Capture shortcut'}</span></>}
        <button className="ambient-dismiss" aria-label="Close retrieval" onClick={collapse}>×</button>
      </header>
      {(error || shortcut?.error) && <p className="capture-error" role="alert">{error || shortcut?.error}</p>}
      {layer === 'contexts' && <div className="ambient-items">
        <button onMouseEnter={() => hoverLayer('waiting')} onMouseLeave={() => clearTimeout(hover.current)} onClick={() => navigate('waiting', true)}>
          <span>Waiting Room</span><small>{records.length}</small>
        </button>
        {legacy.length > 0 && <button onMouseEnter={() => hoverLayer('legacy')} onMouseLeave={() => clearTimeout(hover.current)} onClick={() => navigate('legacy', true)}>
          <span>Legacy notes</span><small>{legacy.length}</small>
        </button>}
        <button className="shortcut-link" onClick={() => navigate('shortcut', true)}>Capture shortcut <small>⌨</small></button>
      </div>}
      {(layer === 'waiting' || layer === 'legacy') && <>
        <div className="ambient-items capture-list">
          {(layer === 'waiting' ? records : legacy).map(record => <button key={record.id}
            onMouseEnter={() => { setPreview(record); setMode('preview'); }}
            onPointerMove={() => { if (preview?.id !== record.id) { setPreview(record); setMode('preview'); } }}
            onFocus={() => { setPreview(record); setMode('preview'); }}
            onClick={() => {
              if (layer === 'waiting') void api.engage(record.id).catch(reason => setError(String(reason)));
              else { setPreview(record); reveal(true); }
            }}><span>{captureLabel(record)}</span><small>{layer === 'waiting' ? '›' : ''}</small></button>)}
          {!(layer === 'waiting' ? records : legacy).length && <p className="ambient-empty">Your next thought will be here.<br />Use {shortcut?.binding || 'the global shortcut'} to capture.</p>}
        </div>
        {preview && <article className="capture-preview" aria-label="Thought preview">
          <p>{preview.content}</p>
          <small>{new Date(preview.created_at).toLocaleString()}{layer === 'legacy' ? ' · Read only' : ''}</small>
        </article>}
      </>}
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
