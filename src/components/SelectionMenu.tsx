import { useEffect, useRef } from 'react';

export interface SelectionMenuItem {
  label: string;
  onSelect: () => void;
}

interface SelectionMenuProps {
  x: number;
  y: number;
  items: SelectionMenuItem[];
  onClose: () => void;
}

/** Small right-click menu for the highlighted-text actions (split, sideline, clone…). */
export function SelectionMenu({ x, y, items, onClose }: SelectionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('contextmenu', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('contextmenu', handle);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="selection-menu" style={{ left: x, top: y }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
