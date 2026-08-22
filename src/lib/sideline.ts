/**
 * The sideline tray: a scratch stack for "grab this, grab that, then do
 * something with all of it" — instead of copy/paste/copy/paste through five
 * pieces of one note, each selection gets sidelined and picked up later, from
 * any note window.
 *
 * Backed by localStorage so it's shared across every note window (all
 * windows share one webview origin) and survives closing a note. A
 * `storage` event keeps every open window's tray in sync; a custom event
 * covers same-window updates, which `storage` does not fire for.
 */

export interface SidelineItem {
  id: string;
  text: string;
  source: string;
  createdAt: number;
}

const KEY = 'hoverthought:sideline';
const EVENT = 'hoverthought-sideline-changed';

function read(): SidelineItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: SidelineItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSideline(): SidelineItem[] {
  return read();
}

export function addToSideline(text: string, source: string): SidelineItem {
  const item: SidelineItem = { id: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, source, createdAt: Date.now() };
  write([...read(), item]);
  return item;
}

export function removeFromSideline(id: string): void {
  write(read().filter((item) => item.id !== id));
}

export function clearSideline(): void {
  write([]);
}

export function subscribeSideline(callback: (items: SidelineItem[]) => void): () => void {
  const handler = () => callback(read());
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
