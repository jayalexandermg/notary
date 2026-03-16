import { useRef, useEffect, useCallback } from 'react';

interface NoteEditorProps {
  content: string;
  onChange: (content: string) => void;
}

/**
 * Single-textarea editor with keyboard shortcuts for todo management.
 *
 * Todo syntax: "- [ ] text" (unchecked) / "- [x] text" (checked)
 * Indented todos: "  - [ ] text" (2 spaces per level, max 4 levels)
 *
 * Shortcuts:
 *   Ctrl+Tab     → convert line to todo (or increase indent if already todo)
 *   Shift+Tab    → decrease indent or convert todo back to text
 *   Tab (on todo)→ increase indent
 *   Tab (on text)→ insert 2 spaces
 *   Enter (todo) → new todo with same indent
 *   Ctrl+Enter   → toggle checkbox on current line
 *   Backspace    → standard (crosses lines, merges, etc.)
 */
export function NoteEditor({ content, onChange }: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [content]);

  // Helper: get current line info from cursor position
  const getLineInfo = useCallback((value: string, cursorPos: number) => {
    const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
    let lineEnd = value.indexOf('\n', cursorPos);
    if (lineEnd === -1) lineEnd = value.length;
    const line = value.substring(lineStart, lineEnd);
    const todoMatch = line.match(/^(\s*)- \[([ x])\] (.*)$/s);
    return { lineStart, lineEnd, line, todoMatch };
  }, []);

  // Helper: apply a text change and restore cursor
  const applyChange = useCallback((newValue: string, cursorPos: number) => {
    const el = textareaRef.current;
    if (!el) return;
    // Set DOM value directly to avoid cursor jump
    el.value = newValue;
    el.selectionStart = el.selectionEnd = cursorPos;
    onChange(newValue);
  }, [onChange]);

  // Auto-check parent todos when a child is toggled
  const autoCheckParents = useCallback((value: string): string => {
    const lines = value.split('\n');
    let changed = true;

    // Iterate until stable (handles multi-level propagation)
    while (changed) {
      changed = false;
      for (let i = 0; i < lines.length; i++) {
        const parentMatch = lines[i].match(/^(\s*)- \[([ x])\] (.*)$/);
        if (!parentMatch) continue;

        const parentIndent = parentMatch[1].length;
        const childIndent = parentIndent + 2;
        let hasChildren = false;
        let allChecked = true;

        for (let j = i + 1; j < lines.length; j++) {
          const childMatch = lines[j].match(/^(\s*)- \[([ x])\] /);
          if (!childMatch) break;
          const ci = childMatch[1].length;
          if (ci < childIndent) break; // went back to parent level or above
          if (ci === childIndent) {
            hasChildren = true;
            if (childMatch[2] === ' ') {
              allChecked = false;
            }
          }
        }

        if (hasChildren) {
          const newState = allChecked ? 'x' : ' ';
          if (parentMatch[2] !== newState) {
            lines[i] = `${parentMatch[1]}- [${newState}] ${parentMatch[3]}`;
            changed = true;
          }
        }
      }
    }

    return lines.join('\n');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = textareaRef.current;
    if (!el) return;

    const { selectionStart, selectionEnd, value } = el;
    const { lineStart, lineEnd, line, todoMatch } = getLineInfo(value, selectionStart);
    const indent = todoMatch ? todoMatch[1] : '';
    const isTodo = !!todoMatch;

    // Ctrl+Enter: toggle checkbox on current line
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (!isTodo) return;

      const currentState = todoMatch![2];
      const newState = currentState === ' ' ? 'x' : ' ';
      const newLine = `${todoMatch![1]}- [${newState}] ${todoMatch![3]}`;
      let newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
      newValue = autoCheckParents(newValue);

      // Keep cursor at same relative position
      const cursorOffset = selectionStart - lineStart;
      const newCursorPos = lineStart + Math.min(cursorOffset, newLine.length);
      applyChange(newValue, newCursorPos);
      return;
    }

    // Enter on todo line: create new todo with same indent
    if (e.key === 'Enter' && !e.shiftKey && isTodo) {
      e.preventDefault();
      const newTodoPrefix = `\n${indent}- [ ] `;
      const newValue = value.substring(0, selectionStart) + newTodoPrefix + value.substring(selectionEnd);
      applyChange(newValue, selectionStart + newTodoPrefix.length);
      return;
    }

    // Ctrl+Tab: convert text→todo or increase todo indent
    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      if (!isTodo) {
        const trimmed = line.trimStart();
        const newLine = `- [ ] ${trimmed}`;
        const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
        applyChange(newValue, lineStart + newLine.length);
      } else if (indent.length < 8) {
        const newLine = `  ${indent}- [${todoMatch![2]}] ${todoMatch![3]}`;
        const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
        applyChange(newValue, selectionStart + 2);
      }
      return;
    }

    // Tab on todo: increase indent
    if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey && isTodo) {
      e.preventDefault();
      if (indent.length < 8) {
        const newLine = `  ${indent}- [${todoMatch![2]}] ${todoMatch![3]}`;
        const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
        applyChange(newValue, selectionStart + 2);
      }
      return;
    }

    // Shift+Tab: decrease indent or convert todo→text
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (!isTodo) return;
      if (indent.length >= 2) {
        const newIndent = indent.substring(2);
        const newLine = `${newIndent}- [${todoMatch![2]}] ${todoMatch![3]}`;
        const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
        applyChange(newValue, Math.max(lineStart, selectionStart - 2));
      } else {
        // Convert todo to plain text
        const newLine = todoMatch![3];
        const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
        applyChange(newValue, lineStart + newLine.length);
      }
      return;
    }

    // Tab on text: insert 2 spaces
    if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey && !isTodo) {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      applyChange(newValue, selectionStart + 2);
      return;
    }
  }, [getLineInfo, applyChange, autoCheckParents]);

  return (
    <div className="note-editor">
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Start typing... (Ctrl+Tab for todo)"
      />
    </div>
  );
}
