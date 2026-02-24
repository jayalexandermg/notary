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
    // Count indent level: 2 spaces per level
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
    // Plain text line (ignore any indent prefix we parsed above)
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

// When a todo's checked state changes, auto-check/uncheck its parent
function autoCheckParents(lines: EditorLine[], changedIndex: number): EditorLine[] {
  const newLines = [...lines];
  const changedLine = newLines[changedIndex];

  if (changedLine.type !== 'todo' || changedLine.indent === 0) return newLines;

  // Find nearest parent (closest previous todo with lower indent)
  for (let i = changedIndex - 1; i >= 0; i--) {
    const parent = newLines[i];
    if (parent.type !== 'todo') break;
    if (parent.indent < changedLine.indent) {
      const childIndent = parent.indent + 1;
      let allChecked = true;
      let hasChildren = false;
      for (let j = i + 1; j < newLines.length; j++) {
        const child = newLines[j];
        if (child.type !== 'todo' || child.indent < childIndent) break;
        if (child.indent === childIndent) {
          hasChildren = true;
          if (!child.checked) allChecked = false;
        }
      }
      if (hasChildren) {
        newLines[i] = { ...parent, checked: allChecked };
      }
      break;
    }
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

  // Sync from external content changes (load, merge)
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

  // Focus management after renders
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

    // Auto-detect todo syntax typed into a plain text line
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
      // Enter on todo → new todo at same indent; on text → new text line
      const newLine: EditorLine =
        line.type === 'todo'
          ? { type: 'todo', text: '', checked: false, indent: line.indent }
          : { type: 'text', text: '', checked: false, indent: 0 };
      newLines.splice(index + 1, 0, newLine);
      focusIndexRef.current = index + 1;
      commitChanges(newLines);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const newLines = [...lines];
      if (e.shiftKey) {
        // Shift+Tab: decrease indent or convert todo → text
        if (line.type === 'todo') {
          if (line.indent === 0) {
            newLines[index] = { type: 'text', text: line.text, checked: false, indent: 0 };
          } else {
            newLines[index] = { ...line, indent: line.indent - 1 };
          }
          commitChanges(newLines);
        }
      } else {
        // Tab on text → convert to todo; Tab on todo → increase indent
        if (line.type === 'text') {
          newLines[index] = { type: 'todo', text: line.text, checked: false, indent: 0 };
        } else {
          newLines[index] = { ...line, indent: Math.min(line.indent + 1, 3) };
        }
        commitChanges(newLines);
      }
    } else if (e.key === 'Backspace' && line.text === '') {
      if (line.type === 'todo') {
        e.preventDefault();
        const newLines = [...lines];
        if (line.indent > 0) {
          // De-indent first
          newLines[index] = { ...line, indent: line.indent - 1 };
        } else {
          // Convert empty todo back to text
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
            ref={(el) => {
              textareaRefs.current[index] = el;
            }}
            value={line.text}
            onChange={(e) => updateText(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={line.type === 'todo' ? 'todo-text editor-textarea' : 'editor-text editor-textarea'}
            placeholder={
              line.type === 'todo'
                ? 'New item...'
                : index === 0
                  ? 'Start typing... (Tab → todo)'
                  : ''
            }
            rows={1}
          />
        </div>
      ))}
    </div>
  );
}
