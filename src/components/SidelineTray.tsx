import { useEffect, useState } from 'react';
import { SidelineItem, clearSideline, getSideline, removeFromSideline, subscribeSideline } from '../lib/sideline';

interface SidelineTrayProps {
  open: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

export function SidelineTray({ open, onClose, onInsert }: SidelineTrayProps) {
  const [items, setItems] = useState<SidelineItem[]>(() => getSideline());

  useEffect(() => subscribeSideline(setItems), []);

  if (!open) return null;

  return (
    <div className="sideline-tray">
      <div className="sideline-tray-header">
        <span>Sideline ({items.length})</span>
        <div className="sideline-tray-actions">
          {items.length > 0 && (
            <button type="button" onClick={() => clearSideline()} title="Clear all">
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>
      <div className="sideline-tray-body">
        {items.length === 0 && <p className="sideline-empty">Select text and sideline it — grab a few pieces, then insert them wherever you need.</p>}
        {items.map((item) => (
          <div key={item.id} className="sideline-item">
            <p className="sideline-item-text">{item.text}</p>
            <div className="sideline-item-actions">
              <button type="button" onClick={() => onInsert(item.text)} title="Insert here">
                Insert
              </button>
              <button type="button" onClick={() => removeFromSideline(item.id)} title="Remove">
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
