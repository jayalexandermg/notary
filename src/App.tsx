import { lazy, Suspense } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { QuickCapture } from './components/QuickCapture';

const AmbientAnchor = lazy(() => import('./components/AmbientAnchor'));
const CaptureEditor = lazy(() => import('./components/CaptureEditor'));

export default function App() {
  let label: string;
  try { label = getCurrentWindow().label; }
  catch { return <p role="alert">Open HoverThought as a desktop application.</p>; }
  if (label === 'capture') return <QuickCapture />;
  return <Suspense fallback={null}>
    {label === 'anchor' ? <AmbientAnchor /> : label === 'editor' ? <CaptureEditor /> : null}
  </Suspense>;
}