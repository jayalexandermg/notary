import { useState, useRef, useEffect, useCallback } from 'react';

interface EditorLine {
  type: 'text' | 'todo';
  text: string;
  checked: boolean;
}

function parseContent(content: string): EditorLine[] {
  if (!content) return [{ type: 'text', text: '', checked: false }];

  return content.split('\n').map((line) => {
    if (line.startsWith('- [x] ')) {
      return { type: 'todo', text: line.slice(6), checked: true };
    }
    if (line.startsWith('- [ ] ')) {
      return { type: 'todo', text: line.slice(6), checked: false };
    }
    return { type: 'text', text: line, checked: false };
  });
}

function serializeLines(lines: EditorLine[]): string {
  return lines
    .map((line) => {
      if (line.type === 'todo') {
        return `- [${line.checked ? 'x' : ' '}] ${line.text}`;
      }
      return line.text;
    })
    .join('\n');
}

interface NoteEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function NoteEditor({ content, onChange }: NoteEditorProps) {
  const [lines, setLines] = useState<EditorLine[]>(() => parseContent(content));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndexRef = useRef<number | null>(null);
  const isInternalChange = useRef(false);

  // Sync from external content changes (e.g. on load, merge)
  useEffect(() => {
    if (!isInternalChange.current) {
      setLines(parseContent(content));
    }
    isInternalChange.current = false;
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
    (newLines: EditorLine[]) => {
      isInternalChange.current = true;
      setLines(newLines);
      onChange(serializeLines(newLines));
    },
    [onChange]
  );

  const toggleCheck = (index: number) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], checked: !newLines[index].checked };
    commitChanges(newLines);
  };

  const updateText = (index: number, text: string) => {
    const newLines = [...lines];
    const line = newLines[index];

    // Auto-detect todo syntax typed into a plain text line
    if (line.type === 'text' && text.startsWith('- [ ] ')) {
      newLines[index] = { type: 'todo', text: text.slice(6), checked: false };
    } else if (line.type === 'text' && text.startsWith('- [x] ')) {
      newLines[index] = { type: 'todo', text: text.slice(6), checked: true };
    } else {
      newLines[index] = { ...line, text };
    }

    commitChanges(newLines);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    const line = lines[index];

    if (e.key === 'Enter') {
      e.preventDefault();
      const newLines = [...lines];
      // Enter on a todo line creates another todo; on text, creates text
      const newLine: EditorLine =
        line.type === 'todo'
          ? { type: 'todo', text: '', checked: false }
          : { type: 'text', text: '', checked: false };
      newLines.splice(index + 1, 0, newLine);
      focusIndexRef.current = index + 1;
      commitChanges(newLines);
    } else if (e.key === 'Backspace' && line.text === '') {
      if (line.type === 'todo') {
        // Empty todo → revert to plain text line
        e.preventDefault();
        const newLines = [...lines];
        newLines[index] = { type: 'text', text: '', checked: false };
        focusIndexRef.current = index;
        commitChanges(newLines);
      } else if (lines.length > 1) {
        // Empty text line → delete it
        e.preventDefault();
        const newLines = [...lines];
        newLines.splice(index, 1);
        focusIndexRef.current = Math.max(0, index - 1);
        commitChanges(newLines);
      }
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowDown' && index < lines.length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="note-editor">
      {lines.map((line, index) => (
        <div
          key={index}
          className={`editor-line ${line.type === 'todo' ? 'todo-line' : 'text-line'}${line.checked ? ' todo-checked' : ''}`}
        >
          {line.type === 'todo' && (
            <input
              type="checkbox"
              checked={line.checked}
              onChange={() => toggleCheck(index)}
              className="todo-checkbox"
            />
          )}
          <input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            value={line.text}
            onChange={(e) => updateText(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={line.type === 'todo' ? 'todo-text' : 'editor-text'}
            placeholder={
              line.type === 'todo'
                ? 'New item...'
                : index === 0
                  ? 'Start typing...'
                  : ''
            }
          />
        </div>
      ))}
    </div>
  );
}
