import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, CaptureSession } from '../lib/capture';

export function QuickCapture() {
  const input = useRef<HTMLTextAreaElement>(null);
  const session = useRef<CaptureSession | null>(null);
  const busy = useRef(false);
  const content = useRef('');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyFrame = useRef(0);

  function activate(next: CaptureSession) {
    if (!next.active) return;
    if (session.current?.sequence !== next.sequence) {
      content.current = '';
      setText('');
      setError(null);
    }
    session.current = next;
    input.current?.focus({ preventScroll: true });
    cancelAnimationFrame(readyFrame.current);
    // A painted, focused input is the boundary; a native show() call is not.
    readyFrame.current = requestAnimationFrame(() => {
      readyFrame.current = requestAnimationFrame(() => {
        if (document.hasFocus() && document.activeElement === input.current && !input.current?.readOnly) {
          void api.inputReady(next.sequence).catch(() => { /* focus event will retry */ });
        }
      });
    });
  }

  async function discard() {
    if (busy.current || !session.current?.active) return;
    busy.current = true;
    try {
      await api.cancel(session.current.sequence);
      session.current.active = false;
      content.current = '';
      setText('');
      setError(null);
    } catch (reason) { setError(String(reason)); }
    finally { busy.current = false; }
  }

  useEffect(() => {
    let stopped = false;
    const invoked = listen<CaptureSession>('capture-invoked', e => { if (!stopped) activate(e.payload); });
    const closed = listen('surface-close-requested', () => { if (!stopped) void discard(); });
    void invoked.then(() => api.captureReady()).then(value => { if (!stopped) activate(value); }).catch(reason => setError(String(reason)));
    const focused = () => { if (session.current?.active) activate(session.current); };
    window.addEventListener('focus', focused);
    return () => {
      stopped = true;
      void invoked.then(unlisten => unlisten());
      void closed.then(unlisten => unlisten());
      window.removeEventListener('focus', focused);
      cancelAnimationFrame(readyFrame.current);
    };
  }, []);

  async function commit() {
    if (busy.current || !session.current?.active || !content.current.trim()) return;
    const started = performance.now();
    const sequence = session.current.sequence;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await api.commit(sequence, content.current);
      // Do not clear a newer invocation that arrived while the IPC was resolving.
      if (session.current?.sequence === sequence) {
        session.current.active = false;
        content.current = '';
        setText('');
      }
      void api.commitElapsed(sequence, performance.now() - started).catch(console.error);
    } catch (reason) { setError(String(reason)); }
    finally {
      busy.current = false;
      setPending(false);
      if (session.current?.active) activate(session.current);
    }
  }

  return <main className="quick-capture ht-surface" aria-label="Quick Capture">
    <textarea ref={input} aria-label="Capture a thought" autoFocus spellCheck
      placeholder="What's on your mind?" value={text} readOnly={pending}
      onChange={event => { content.current = event.target.value; setText(event.target.value); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void commit(); }
        if (event.key === 'Escape') { event.preventDefault(); void discard(); }
      }} />
    <footer>
      <span className="capture-hint" role="status">{error || (pending ? 'Saving…' : <><b>Enter</b> save · <b>Shift+Enter</b> newline · <b>Esc</b> discard</>)}</span>
      <span className="surface-destination"><span className="surface-pip" aria-hidden="true" />Waiting Room</span>
      <button className="surface-close" aria-label="Discard draft" title="Discard draft (Esc)" onClick={() => void discard()} disabled={pending}>×</button>
    </footer>
  </main>;
}
