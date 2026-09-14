import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, CaptureSession, SurfacePreferences } from '../lib/capture';
import { useCaptureContext } from '../hooks/useCaptureContext';
import DestinationRouter, { contextPath } from './DestinationRouter';

export function QuickCapture() {
  const { context, contextError } = useCaptureContext();
  const input = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const session = useRef<CaptureSession | null>(null);
  const busy = useRef(false);
  const content = useRef(''), titleValue = useRef('');
  const override = useRef<string | null>(null);
  const [text, setText] = useState(''), [title, setTitle] = useState('');
  const [destinationOverride, setDestinationOverride] = useState<string | null>(null);
  const [router, setRouter] = useState(false), [opacityOpen, setOpacityOpen] = useState(false);
  const [prefs, setPrefs] = useState<SurfacePreferences>({ opacity: 1, always_on_top: true });
  const preferences = useRef(prefs);
  const [pending, setPending] = useState(false);
  const [savedPendingDismiss, setSavedPendingDismiss] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyFrame = useRef(0);
  const readiness = useRef({ sequence: -1, received: 0, focused: 0 });
  const resizeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const resizeVersion = useRef(0);
  const preferencesQueue = useRef<Promise<unknown>>(Promise.resolve());
  const destinationId = destinationOverride || context?.primary_container_id || 'waiting-room';
  const destination = context?.containers.find(c => c.id === destinationId)?.name || 'Automatic';
  const path = contextPath(context?.containers || [], destinationId).map(c => c.name).join(' / ');

  function clearDraft() { content.current = ''; titleValue.current = ''; override.current = null; setText(''); setTitle(''); setDestinationOverride(null); setRouter(false); }
  function activate(next: CaptureSession) {
    if (!next.active) return;
    if (readiness.current.sequence !== next.sequence) readiness.current = { sequence: next.sequence, received: performance.now(), focused: 0 };
    if (session.current?.sequence !== next.sequence) { clearDraft(); setError(null); setSavedPendingDismiss(false); }
    session.current = next;
    input.current?.focus({ preventScroll: true });
    readiness.current.focused = performance.now() - readiness.current.received;
    cancelAnimationFrame(readyFrame.current);
    readyFrame.current = requestAnimationFrame(() => {
      readyFrame.current = requestAnimationFrame(() => {
        if (document.hasFocus() && document.activeElement === input.current && !input.current?.readOnly) {
          void api.inputReady(next.sequence, readiness.current.focused, performance.now() - readiness.current.received).catch(() => { /* focus event will retry */ });
        }
      });
    });
  }
  async function discard() {
    if (busy.current || !session.current?.active) return;
    const sequence = session.current.sequence;
    busy.current = true; setPending(true);
    try { await api.cancel(sequence); if (session.current?.sequence === sequence) { session.current.active = false; clearDraft(); setError(null); } }
    catch (error) { setError(String(error)); }
    finally { busy.current = false; setPending(false); }
  }
  async function commit() {
    if (busy.current || !session.current?.active) return;
    if (!content.current.trim() && !titleValue.current.trim()) { await discard(); return; }
    const started = performance.now(), sequence = session.current.sequence;
    busy.current = true; setPending(true); setError(null);
    try {
      await api.commit(sequence, content.current, titleValue.current.trim() ? titleValue.current : null, override.current);
      if (session.current?.sequence === sequence) { session.current.active = false; clearDraft(); }
      void api.commitElapsed(sequence, performance.now() - started).catch(console.error);
    } catch (error) {
      if (String(error).startsWith('Saved; dismiss failed.')) setSavedPendingDismiss(true);
      setError(String(error)); throw error;
    }
    finally { busy.current = false; setPending(false); if (session.current?.active) activate(session.current); }
  }
  function saveClose() { void commit().catch(() => {}); }
  useEffect(() => {
    let stopped = false;
    const target = { target: 'capture' };
    const invoked = listen<CaptureSession>('capture-invoked', event => { if (!stopped) { setRouter(false); activate(event.payload); } }, target);
    const closed = listen('surface-close-requested', () => { if (!stopped) saveClose(); }, target);
    const quit = listen('quit-requested', () => {
      if (!stopped) void (async () => {
        while (busy.current) await new Promise(resolve => setTimeout(resolve, 10));
        await commit(); await api.quit();
      })().catch(error => setError(String(error)));
    }, target);
    void invoked.then(() => api.captureReady()).then(value => { if (!stopped) activate(value); }).catch(error => setError(String(error)));
    void api.quickPreferences().then(value => { if (!stopped) { preferences.current = value; setPrefs(value); } }).catch(error => setError(String(error)));
    const focused = () => { if (session.current?.active) activate(session.current); };
    const blur = () => { setRouter(false); setOpacityOpen(false); };
    window.addEventListener('focus', focused); window.addEventListener('blur', blur);
    return () => { stopped = true; for (const subscription of [invoked, closed, quit]) void subscription.then(unlisten => unlisten());
      window.removeEventListener('focus', focused); window.removeEventListener('blur', blur); cancelAnimationFrame(readyFrame.current); };
  }, []);
  useEffect(() => {
    const version = ++resizeVersion.current;
    resizeQueue.current = resizeQueue.current.catch(() => {}).then(() => { if (version === resizeVersion.current) return api.captureRouter(router); }).catch(error => setError(String(error)));
  }, [router]);
  function presentation(change: (value: SurfacePreferences) => SurfacePreferences) {
    preferencesQueue.current = preferencesQueue.current.catch(() => {}).then(async () => {
      const next = change(preferences.current);
      await api.quickPresentation(next.opacity, next.always_on_top); preferences.current = next; setPrefs(next);
    }).catch(error => setError(String(error)));
  }
  return <div className="quick-workspace" style={{ opacity: prefs.opacity }} onPointerDown={event => {
    const target = event.target as HTMLElement;
    if (!target.closest('.quick-router') && !target.closest('.destination-chip')) setRouter(false);
  }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); if (router) setRouter(false); else if (opacityOpen) setOpacityOpen(false); else void discard(); }
    if (event.key === 'Enter' && !event.shiftKey && (event.target === input.current || event.target === titleInput.current)) { event.preventDefault(); saveClose(); }
  }}>
    <main className="quick-capture ht-surface" aria-label="Quick Capture">
      <header className="quick-header"><input ref={titleInput} aria-label="Capture title" placeholder="Title…" value={title} readOnly={pending || savedPendingDismiss} onChange={event => { titleValue.current = event.target.value; setTitle(event.target.value); }} />
        <button aria-label="Capture opacity" title="Opacity" onClick={() => setOpacityOpen(!opacityOpen)}>◐</button>
        <button aria-label="Pin Quick Capture" title={prefs.always_on_top ? 'Unpin' : 'Pin'} aria-pressed={prefs.always_on_top} onClick={() => presentation(value => ({ ...value, always_on_top: !value.always_on_top }))}>Pin</button>
        <button aria-label="Discard draft" title="Discard" disabled={pending} onClick={() => void discard()}>⌫</button>
        <button className="surface-close" aria-label="Save and close capture" title="Save & close" disabled={pending} onClick={saveClose}>×</button>
      </header>
      <textarea ref={input} aria-label="Capture a thought" autoFocus spellCheck placeholder="What's on your mind?" value={text} readOnly={pending || savedPendingDismiss}
        onChange={event => { content.current = event.target.value; setText(event.target.value); }} />
      <footer><span className="capture-hint" role="status" title={error || contextError || ''}>{error || contextError || (pending ? 'Saving…' : <><b>Enter</b> save · <b>Shift+Enter</b> newline · <b>Esc</b> discard</>)}</span>
        <button className="surface-destination destination-chip" title={path || 'Automatic destination'} aria-label="Capture destination" disabled={pending || savedPendingDismiss || !context} onClick={() => { setOpacityOpen(false); setRouter(!router); }}><span className="surface-pip" /><span className="destination-name">{destination}</span></button>
      </footer>
      {opacityOpen && <label className="opacity-popover">Opacity<input aria-label="Capture opacity level" type="range" min="0.1" max="1" step="0.05" value={prefs.opacity} onChange={event => { const opacity = Number(event.target.value); presentation(value => ({ ...value, opacity })); }} /></label>}
    </main>
    {router && <div className="quick-router ht-surface"><DestinationRouter containers={context?.containers || []} onCancel={() => setRouter(false)} onSelect={id => {
      override.current = id; setDestinationOverride(id); setRouter(false); input.current?.focus();
    }} /></div>}
  </div>;
}
