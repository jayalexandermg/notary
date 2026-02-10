import { useState, useRef, useEffect, useCallback } from 'react';

interface TodoItem {
  checked: boolean;
  text: string;
}

interface TodoListProps {
  content: string;
  onChange: (content: string) => void;
}

function parseContent(content: string): TodoItem[] {
  if (!content.trim()) return [{ checked: false, text: '' }];

  return content.split('\n').map((line) => {
    if (line.startsWith('- [x] ')) {
      return { checked: true, text: line.slice(6) };
    } else if (line.startsWith('- [ ] ')) {
      return { checked: false, text: line.slice(6) };
    }
    return { checked: false, text: line };
  });
}

function serializeItems(items: TodoItem[]): string {
  return items
    .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`)
    .join('\n');
}

export function TodoList({ content, onChange }: TodoListProps) {
  const [items, setItems] = useState<TodoItem[]>(() => parseContent(content));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndexRef = useRef<number | null>(null);

  // Sync from external content changes (e.g. on load)
  useEffect(() => {
    setItems(parseContent(content));
  }, [content]);

  // Focus management after renders
  useEffect(() => {
    if (focusIndexRef.current !== null) {
      const idx = focusIndexRef.current;
      focusIndexRef.current = null;
      inputRefs.current[idx]?.focus();
    }
  });

  const commitChanges = useCallback(
    (newItems: TodoItem[]) => {
      setItems(newItems);
      onChange(serializeItems(newItems));
    },
    [onChange]
  );

  const toggleItem = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], checked: !newItems[index].checked };
    commitChanges(newItems);
  };

  const updateText = (index: number, text: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], text };
    commitChanges(newItems);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newItems = [...items];
      newItems.splice(index + 1, 0, { checked: false, text: '' });
      focusIndexRef.current = index + 1;
      commitChanges(newItems);
    } else if (e.key === 'Backspace' && items[index].text === '' && items.length > 1) {
      e.preventDefault();
      const newItems = [...items];
      newItems.splice(index, 1);
      focusIndexRef.current = Math.max(0, index - 1);
      commitChanges(newItems);
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowDown' && index < items.length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="todo-list">
      {items.map((item, index) => (
        <div key={index} className={`todo-item ${item.checked ? 'todo-checked' : ''}`}>
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => toggleItem(index)}
            className="todo-checkbox"
          />
          <input
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            value={item.text}
            onChange={(e) => updateText(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="todo-text"
            placeholder="New item..."
          />
        </div>
      ))}
    </div>
  );
}
