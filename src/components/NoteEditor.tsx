import { useState, useRef, useEffect, useCallback } from 'react';

interface EditorLine {
  type: 'text' | 'todo';
  text: string;
  checked: boolean;
  indent: number; // 0 = top-level, 1 = one tab in, etc.
}

function parseContent(content: string): EditorLine[] {
  if (!content) return [{ type: 'text', text: '', checked: false, indent: 0 }];

  return content.split('\n').map((line) => {
    let indent = 0;
    let stripped = line;
    while (stripped.startsWith('  ')) {
      indent++;
      stripped = stripped.slice(2);
    }
    if (stripped.startsWith('- [x] ')) {
      return { type: 'todo', text: stripped.slice(6), checked: true, indent };
    }
    if (stripped.startsWith('- [ ] ')) {
      return { type: 'todo', text: stripped.slice(6), checked: false, indent };
    }
    return { type: 'text', text: line, checked: false, indent: 0 };
  });
}

function serializeLines(lines: EditorLine[]): string {
  return lines
    .map((line) => {
      if (line.type === 'todo') {
        const spaces = '  '.repeat(line.indent);
        return `${spaces}- [${line.checked ? 'x' : ' '}] ${line.text}`;
      }
      return line.text;
    })
    .join('\n');
}

// Propagate check state up through all parent levels
function autoCheckParents(lines: EditorLine[], changedIndex: number): EditorLine[] {
  let newLines = [...lines];
  let currentIndex = changedIndex;

  while (currentIndex >= 0) {
    const currentLine = newLines[currentIndex];
    if (currentLine.type !== 'todo' || currentLine.indent === 0) break;

    // Find nearest parent (closest previous todo with lower indent)
    let parentIndex = -1;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const candidate = newLines[i];
      if (candidate.type !== 'todo') break;
      if (candidate.indent < currentLine.indent) {
        parentIndex = i;
        break;
      }
    }
    if (parentIndex === -1) break;

    const parent = newLines[parentIndex];
    const childIndent = parent.indent + 1;
    let allChecked = true;
    let hasChildren = false;

    for (let j = parentIndex + 1; j < newLines.length; j++) {
      const child = newLines[j];
      if (child.type !== 'todo' || child.indent < childIndent) break;
      if (child.indent === childIndent) {
        hasChildren = true;
        if (!child.checked) {
          allChecked = false;
          break;
        }
      }
    }

    if (hasChildren) {
      newLines[parentIndex] = { ...parent, checked: allChecked };
    }
    currentIndex = parentIndex;
  }

  return newLines;
}

interface NoteEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function NoteEditor({ content, onChange }: NoteEditorProps) {
  const [lines, setLines] = useState<EditorLine[]>(() => parseContent(content));
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusIndexRef = useRef<number | null>(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (!isInternalChange.current) {
      setLines(parseContent(content));
    }
    isInternalChange.current = false;
  }, [content]);

  // Auto-resize all textareas after every render
  useEffect(() => {
    textareaRefs.current.forEach((el) => {
      if (el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    });
  });

  useEffect(() => {
    if (focusIndexRef.current !== null) {
      const idx = focusIndexRef.current;
      focusIndexRef.current = null;
      textareaRefs.current[idx]?.focus();
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
    commitChanges(autoCheckParents(newLines, index));
  };

  const updateText = (index: number, text: string) => {
    const newLines = [...lines];
    const line = newLines[index];
    if (line.type === 'text' && text.startsWith('- [x] ')) {
      newLines[index] = { type: 'todo', text: text.slice(6), checked: true, indent: 0 };
    } else if (line.type === 'text' && text.startsWith('- [ ] ')) {
      newLines[index] = { type: 'todo', text: text.slice(6), checked: false, indent: 0 };
    } else {
      newLines[index] = { ...line, text };
    }
    commitChanges(newLines);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const line = lines[index];

    if (e.key === 'Enter') {
      e.preventDefault();
      const newLines = [...lines];
      const newLine: EditorLine =
        line.type === 'todo'
          ? { type: 'todo', text: '', checked: false, indent: line.indent }
          : { type: 'text', text: '', checked: false, indent: 0 };
      newLines.splice(index + 1, 0, newLine);
      focusIndexRef.current = index + 1;
      commitChanges(newLines);

    } else if (e.key === 'Tab') {
      e.preventDefault();

      if (e.ctrlKey) {
        // Ctrl+Tab: convert text → todo, or increase todo indent
        const newLines = [...lines];
        if (line.type === 'text') {
          newLines[index] = { type: 'todo', text: line.text, checked: false, indent: 0 };
        } else {
          newLines[index] = { ...line, indent: Math.min(line.indent + 1, 3) };
        }
        commitChanges(newLines);

      } else if (e.shiftKey) {
        // Shift+Tab: decrease indent or convert todo → text
        if (line.type === 'todo') {
          const newLines = [...lines];
          if (line.indent === 0) {
            newLines[index] = { type: 'text', text: line.text, checked: false, indent: 0 };
          } else {
            newLines[index] = { ...line, indent: line.indent - 1 };
          }
          commitChanges(newLines);
        }

      } else {
        // Regular Tab:
        // - todo line: increase indent level
        // - text line: insert 2 spaces at cursor
        if (line.type === 'todo') {
          const newLines = [...lines];
          newLines[index] = { ...line, indent: Math.min(line.indent + 1, 3) };
          commitChanges(newLines);
        } else {
          const el = textareaRefs.current[index];
          if (el) {
            const start = el.selectionStart ?? line.text.length;
            const end = el.selectionEnd ?? line.text.length;
            const newText = line.text.substring(0, start) + '  ' + line.text.substring(end);
            const newLines = [...lines];
            newLines[index] = { ...line, text: newText };
            isInternalChange.current = true;
            setLines(newLines);
            onChange(serializeLines(newLines));
            requestAnimationFrame(() => {
              if (el) {
                el.selectionStart = start + 2;
                el.selectionEnd = start + 2;
              }
            });
          }
        }
      }

    } else if (e.key === 'Backspace' && line.text === '') {
      if (line.type === 'todo') {
        e.preventDefault();
        const newLines = [...lines];
        if (line.indent > 0) {
          newLines[index] = { ...line, indent: line.indent - 1 };
        } else {
          newLines[index] = { type: 'text', text: '', checked: false, indent: 0 };
        }
        focusIndexRef.current = index;
        commitChanges(newLines);
      } else if (lines.length > 1) {
        e.preventDefault();
        const newLines = [...lines];
        newLines.splice(index, 1);
        focusIndexRef.current = Math.max(0, index - 1);
        commitChanges(newLines);
      }

    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      textareaRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowDown' && index < lines.length - 1) {
      e.preventDefault();
      textareaRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="note-editor">
      {lines.map((line, index) => (
        <div
          key={index}
          className={`editor-line ${line.type === 'todo' ? 'todo-line' : 'text-line'}${line.checked ? ' todo-checked' : ''}`}
          style={line.type === 'todo' && line.indent > 0 ? { paddingLeft: `${line.indent * 20}px` } : undefined}
        >
          {line.type === 'todo' && (
            <input
              type="checkbox"
              checked={line.checked}
              onChange={() => toggleCheck(index)}
              className="todo-checkbox"
            />
          )}
          <textarea
            ref={(el) => { textareaRefs.current[index] = el; }}
            value={line.text}
            onChange={(e) => updateText(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={line.type === 'todo' ? 'todo-text editor-textarea' : 'editor-text editor-textarea'}
            placeholder={
              line.type === 'todo'
                ? 'New item...'
                : index === 0
                  ? 'Start typing... (Ctrl+Tab for todo)'
                  : ''
            }
            rows={1}
          />
        </div>
      ))}
    </div>
  );
}
