import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, CaptureContext } from '../lib/capture';

/** Route/name feedback loads independently of Quick Capture's input readiness. */
export function useCaptureContext() {
  const [context, setContext] = useState<CaptureContext | null>(null);
  const [contextError, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let generation = 0;
    async function refresh() {
      const current = ++generation;
      try {
        const next = await api.context();
        if (!stopped && current === generation) { setContext(next); setError(null); }
      } catch (reason) {
        if (!stopped && current === generation) { setContext(null); setError(String(reason)); }
      }
    }
    const subscriptions = ['containers-changed', 'captures-changed'].map(event => listen(event, () => void refresh()));
    void Promise.all(subscriptions).then(() => refresh()).catch(reason => { if (!stopped) setError(String(reason)); });
    return () => { stopped = true; for (const pending of subscriptions) void pending.then(unlisten => unlisten(), () => {}); };
  }, []);
  return { context, contextError };
}
