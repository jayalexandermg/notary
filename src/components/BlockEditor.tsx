import { MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Block,
  BlockType,
  MAX_INDENT,
  applyAutoCheck,
  balanceMarkers,
  descendantRange,
  formatStamp,
  makeBlock,
  parseBlocks,
  plainLength,
  plainToMarkdownOffset,
  renderInline,
  serializeBlocks,
  serializeInline,
  visibleFlags,
} from '../lib/blocks';
import { ActionId, Keymap, matchesBinding } from '../lib/keybindings';

export interface EditorApi {
  runAction: (action: ActionId) => void;
  setBlockType: (type: BlockType) => void;
  insertTodo: () => void;
  getSelectionText: () => string;
  cutSelection: () => string;
  cloneSelection: () => void;
  insertText: (text: string) => void;
  stampCurrentBlock: () => void;
  wrapSelectionInToggle: () => void;
  focus: () => void;
}

interface BlockEditorProps {
  content: string;
  onChange: (content: string) => void;
  keymap: Keymap;
  autoStamp: boolean;
  apiRef: MutableRefObject<EditorApi | null>;
  onSideline?: (text: string) => void;
  onSplit?: (text: string) => void;
  onSelectionContextMenu?: (x: number, y: number) => void;
}

interface CaretTarget {
  id: string;
  offset: number;
}

/* ------------------------------------------------------------------ caret */

function caretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaret(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  let remaining = offset;
  let placed = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        placed = true;
        return true;
      }
      remaining -= len;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  walk(el);
  if (placed) {
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

interface SelectionSpan {
  startId: string;
  startOffset: number;
  endId: string;
  endOffset: number;
  collapsed: boolean;
}

function blockElementOf(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.dataset.blockId) return current;
    current = current.parentNode;
  }
  return null;
}

function readSelectionSpan(container: HTMLElement): SelectionSpan | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const startEl = blockElementOf(range.startContainer);
  const endEl = blockElementOf(range.endContainer);
  if (!startEl || !endEl) return null;

  const startPre = range.cloneRange();
  startPre.selectNodeContents(startEl);
  startPre.setEnd(range.startContainer, range.startOffset);

  const endPre = range.cloneRange();
  endPre.selectNodeContents(endEl);
  endPre.setEnd(range.endContainer, range.endOffset);

  return {
    startId: startEl.dataset.blockId!,
    startOffset: startPre.toString().length,
    endId: endEl.dataset.blockId!,
    endOffset: endPre.toString().length,
    collapsed: range.collapsed,
  };
}

/* ----------------------------------------------------------------- editor */

export function BlockEditor({
  content,
  onChange,
  keymap,
  autoStamp,
  apiRef,
  onSideline,
  onSplit,
  onSelectionContextMenu,
}: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(content));

  const containerRef = useRef<HTMLDivElement>(null);
  const elRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastSerialized = useRef<string>(content);
  const pendingCaret = useRef<CaretTarget | null>(null);
  const lastCaret = useRef<CaretTarget | null>(null);
  /** Tab-then-Enter chord: Tab arms it, Enter within the window makes a todo. */
  const tabArmed = useRef<{ id: string; at: number; indent: number } | null>(null);

  const visible = visibleFlags(blocks);

  // Adopt content that changed outside the editor (merge, load, sideline paste).
  useEffect(() => {
    if (content !== lastSerialized.current) {
      lastSerialized.current = content;
      setBlocks(parseBlocks(content));
    }
  }, [content]);

  const commit = useCallback(
    (next: Block[], caret?: CaretTarget) => {
      const text = serializeBlocks(next);
      lastSerialized.current = text;
      if (caret) pendingCaret.current = caret;
      setBlocks(next);
      onChange(text);
    },
    [onChange]
  );

  // Push block text into the DOM only when it actually diverged, so typing is
  // never interrupted by a re-render.
  useLayoutEffect(() => {
    for (const block of blocks) {
      const el = elRefs.current[block.id];
      if (!el) continue;
      if (serializeInline(el) !== block.text) {
        el.innerHTML = renderInline(block.text);
      }
    }

    const target = pendingCaret.current;
    if (target) {
      pendingCaret.current = null;
      const el = elRefs.current[target.id];
      if (el) {
        el.focus();
        setCaret(el, target.offset);
        lastCaret.current = target;
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  /* ------------------------------------------------------------ helpers */

  const indexOfId = useCallback(
    (id: string | undefined | null) => (id ? blocks.findIndex((b) => b.id === id) : -1),
    [blocks]
  );

  const activeIndex = useCallback(() => {
    const idx = indexOfId(lastCaret.current?.id);
    return idx >= 0 ? idx : blocks.length - 1;
  }, [blocks.length, indexOfId]);

  const prevVisible = useCallback(
    (index: number) => {
      for (let i = index - 1; i >= 0; i--) if (visible[i]) return i;
      return -1;
    },
    [visible]
  );

  const nextVisible = useCallback(
    (index: number) => {
      for (let i = index + 1; i < blocks.length; i++) if (visible[i]) return i;
      return -1;
    },
    [blocks.length, visible]
  );

  const rememberCaret = useCallback((id: string) => {
    const el = elRefs.current[id];
    if (el) lastCaret.current = { id, offset: caretOffsetIn(el) };
  }, []);

  const ensureFocus = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.dataset.blockId) return;
    const target = lastCaret.current ?? { id: blocks[blocks.length - 1]?.id, offset: 0 };
    const el = target.id ? elRefs.current[target.id] : null;
    if (el) {
      el.focus();
      setCaret(el, target.offset);
    }
  }, [blocks]);

  /* ------------------------------------------------------------- actions */

  const handleInput = useCallback(
    (id: string) => {
      const el = elRefs.current[id];
      if (!el) return;
      const text = serializeInline(el);
      const next = blocks.map((b) => (b.id === id ? { ...b, text } : b));
      lastCaret.current = { id, offset: caretOffsetIn(el) };
      const serialized = serializeBlocks(next);
      lastSerialized.current = serialized;
      setBlocks(next);
      onChange(serialized);
    },
    [blocks, onChange]
  );

  const toggleCheck = useCallback(
    (index: number) => {
      if (index < 0 || index >= blocks.length) return;
      const block = blocks[index];
      if (block.type !== 'todo') return;

      const checked = !block.checked;
      const next = blocks.map((b) => ({ ...b }));
      next[index].checked = checked;

      // Checking a parent checks everything nested under it.
      const [start, end] = descendantRange(next, index);
      for (let i = start; i < end; i++) {
        if (next[i].type === 'todo') next[i].checked = checked;
      }

      commit(applyAutoCheck(next));
    },
    [blocks, commit]
  );

  const toggleCollapse = useCallback(
    (index: number) => {
      const next = blocks.map((b, i) => (i === index ? { ...b, collapsed: !b.collapsed } : b));
      commit(next);
    },
    [blocks, commit]
  );

  const changeType = useCallback(
    (type: BlockType) => {
      ensureFocus();
      const index = activeIndex();
      if (index < 0) return;

      const current = blocks[index];
      const nextType = current.type === type ? 'text' : type;
      const next = blocks.map((b, i) =>
        i === index
          ? {
              ...b,
              type: nextType,
              checked: nextType === 'todo' ? b.checked : false,
              collapsed: nextType === 'toggle' ? b.collapsed : false,
            }
          : b
      );
      commit(applyAutoCheck(next), { id: current.id, offset: plainLength(current.text) });
    },
    [activeIndex, blocks, commit, ensureFocus]
  );

  /**
   * Todos are ordinary lines, never a mode: this converts the current line when
   * it is empty and otherwise opens a fresh todo line right below it.
   */
  const insertTodo = useCallback(() => {
    ensureFocus();
    const index = activeIndex();
    const next = blocks.map((b) => ({ ...b }));

    if (index >= 0 && next[index].type !== 'todo' && next[index].text.trim() === '') {
      next[index] = { ...next[index], type: 'todo', checked: false };
      commit(applyAutoCheck(next), { id: next[index].id, offset: 0 });
      return;
    }

    const at = index >= 0 ? index : next.length - 1;
    const anchor = next[at];
    const todo = makeBlock({
      type: 'todo',
      indent: anchor ? anchor.indent : 0,
      stamp: autoStamp ? formatStamp() : null,
    });
    next.splice(at + 1, 0, todo);
    commit(applyAutoCheck(next), { id: todo.id, offset: 0 });
  }, [activeIndex, autoStamp, blocks, commit, ensureFocus]);

  const stampCurrentBlock = useCallback(() => {
    const index = activeIndex();
    if (index < 0) return;
    const block = blocks[index];
    const next = blocks.map((b, i) =>
      i === index ? { ...b, stamp: b.stamp ? null : formatStamp() } : b
    );
    commit(next, { id: block.id, offset: plainLength(block.text) });
  }, [activeIndex, blocks, commit]);

  const wrapSelectionMarkers = useCallback(
    (marker: string) => {
      ensureFocus();
      const container = containerRef.current;
      if (!container) return;
      const span = readSelectionSpan(container);
      if (!span) return;

      const index = indexOfId(span.startId);
      if (index < 0 || span.startId !== span.endId) return;

      const block = blocks[index];
      const from = plainToMarkdownOffset(block.text, Math.min(span.startOffset, span.endOffset));
      const to = plainToMarkdownOffset(block.text, Math.max(span.startOffset, span.endOffset));
      const text =
        block.text.slice(0, from) + marker + block.text.slice(from, to) + marker + block.text.slice(to);

      const next = blocks.map((b, i) => (i === index ? { ...b, text } : b));
      const caretPlain = Math.max(span.startOffset, span.endOffset);
      commit(next, { id: block.id, offset: caretPlain });
    },
    [blocks, commit, ensureFocus, indexOfId]
  );

  const getSelectionText = useCallback(() => window.getSelection()?.toString() ?? '', []);

  /** Remove the selection and hand it back as markdown (used by split). */
  const cutSelection = useCallback((): string => {
    const container = containerRef.current;
    if (!container) return '';
    const span = readSelectionSpan(container);
    if (!span || span.collapsed) return '';

    const startIdx = indexOfId(span.startId);
    const endIdx = indexOfId(span.endId);
    if (startIdx < 0 || endIdx < 0) return '';

    const [firstIdx, lastIdx] =
      startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const [firstOffset, lastOffset] =
      startIdx <= endIdx ? [span.startOffset, span.endOffset] : [span.endOffset, span.startOffset];

    const first = blocks[firstIdx];
    const last = blocks[lastIdx];

    if (firstIdx === lastIdx) {
      const from = plainToMarkdownOffset(first.text, Math.min(firstOffset, lastOffset));
      const to = plainToMarkdownOffset(first.text, Math.max(firstOffset, lastOffset));
      const removed = balanceMarkers(first.text.slice(from, to));
      const kept = balanceMarkers(first.text.slice(0, from) + first.text.slice(to));
      const next = blocks.map((b, i) => (i === firstIdx ? { ...b, text: kept } : b));
      commit(applyAutoCheck(next), { id: first.id, offset: Math.min(firstOffset, lastOffset) });
      return serializeBlocks([{ ...first, text: removed, indent: 0 }]);
    }

    const startCut = plainToMarkdownOffset(first.text, firstOffset);
    const endCut = plainToMarkdownOffset(last.text, lastOffset);

    const removedBlocks: Block[] = [
      { ...first, text: balanceMarkers(first.text.slice(startCut)), indent: 0 },
      ...blocks.slice(firstIdx + 1, lastIdx),
      { ...last, text: balanceMarkers(last.text.slice(0, endCut)) },
    ].filter((b, i, arr) => !(b.text === '' && (i === 0 || i === arr.length - 1) && arr.length > 1));

    const merged: Block = {
      ...first,
      text: balanceMarkers(first.text.slice(0, startCut) + last.text.slice(endCut)),
    };

    const next = [...blocks.slice(0, firstIdx), merged, ...blocks.slice(lastIdx + 1)];
    commit(applyAutoCheck(next.length ? next : [makeBlock()]), { id: merged.id, offset: firstOffset });

    const minIndent = Math.min(...removedBlocks.map((b) => b.indent));
    return serializeBlocks(removedBlocks.map((b) => ({ ...b, indent: b.indent - minIndent })));
  }, [blocks, commit, indexOfId]);

  const insertText = useCallback(
    (text: string) => {
      if (!text) return;
      const incoming = parseBlocks(text);
      const index = activeIndex();
      const at = index >= 0 ? index : blocks.length - 1;
      const next = [...blocks];

      // Drop straight into an empty line rather than leaving a blank behind.
      if (at >= 0 && next[at] && next[at].text.trim() === '' && next[at].type === 'text') {
        next.splice(at, 1, ...incoming);
      } else {
        next.splice(at + 1, 0, ...incoming);
      }

      const landing = incoming[incoming.length - 1];
      commit(applyAutoCheck(next), { id: landing.id, offset: plainLength(landing.text) });
    },
    [activeIndex, blocks, commit]
  );

  /** Wrap the selected blocks in a collapsible toggle. */
  const wrapSelectionInToggle = useCallback(() => {
    const container = containerRef.current;
    const span = container ? readSelectionSpan(container) : null;

    let firstIdx = activeIndex();
    let lastIdx = firstIdx;
    if (span) {
      const a = indexOfId(span.startId);
      const b = indexOfId(span.endId);
      if (a >= 0 && b >= 0) {
        firstIdx = Math.min(a, b);
        lastIdx = Math.max(a, b);
      }
    }
    if (firstIdx < 0) return;

    const baseIndent = blocks[firstIdx].indent;
    const header = makeBlock({ type: 'toggle', indent: baseIndent, text: 'Toggle' });
    const wrapped = blocks
      .slice(firstIdx, lastIdx + 1)
      .map((b) => ({ ...b, indent: Math.min(b.indent + 1, MAX_INDENT) }));

    const next = [
      ...blocks.slice(0, firstIdx),
      header,
      ...wrapped,
      ...blocks.slice(lastIdx + 1),
    ];
    commit(applyAutoCheck(next), { id: header.id, offset: header.text.length });
  }, [activeIndex, blocks, commit, indexOfId]);

  /** Duplicate the selected blocks (or just the current one) right below. */
  const cloneSelection = useCallback(() => {
    const container = containerRef.current;
    const span = container ? readSelectionSpan(container) : null;

    let firstIdx = activeIndex();
    let lastIdx = firstIdx;
    if (span) {
      const a = indexOfId(span.startId);
      const b = indexOfId(span.endId);
      if (a >= 0 && b >= 0) {
        firstIdx = Math.min(a, b);
        lastIdx = Math.max(a, b);
      }
    }
    if (firstIdx < 0) return;

    const copies = blocks
      .slice(firstIdx, lastIdx + 1)
      .map((b) => makeBlock({ type: b.type, indent: b.indent, text: b.text, checked: b.checked, collapsed: b.collapsed, stamp: b.stamp }));
    const next = [...blocks.slice(0, lastIdx + 1), ...copies, ...blocks.slice(lastIdx + 1)];
    const last = copies[copies.length - 1];
    commit(applyAutoCheck(next), { id: last.id, offset: plainLength(last.text) });
  }, [activeIndex, blocks, commit, indexOfId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onSelectionContextMenu) return;

    const handler = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim() === '') return;
      if (!container.contains(sel.anchorNode)) return;
      e.preventDefault();
      onSelectionContextMenu(e.clientX, e.clientY);
    };

    container.addEventListener('contextmenu', handler);
    return () => container.removeEventListener('contextmenu', handler);
  }, [onSelectionContextMenu]);

  const runAction = useCallback(
    (action: ActionId) => {
      switch (action) {
        case 'bold':
        case 'italic': {
          ensureFocus();
          document.execCommand('styleWithCSS', false, 'false');
          document.execCommand(action);
          const id = lastCaret.current?.id;
          if (id) handleInput(id);
          break;
        }
        case 'code':
          wrapSelectionMarkers('`');
          break;
        case 'heading1':
          changeType('h1');
          break;
        case 'heading2':
          changeType('h2');
          break;
        case 'heading3':
          changeType('h3');
          break;
        case 'bullet':
          changeType('bullet');
          break;
        case 'toggle':
          changeType('toggle');
          break;
        case 'todo':
          insertTodo();
          break;
        case 'checkToggle':
          toggleCheck(activeIndex());
          break;
        case 'timestamp':
          stampCurrentBlock();
          break;
        case 'sideline': {
          const text = getSelectionText();
          if (text) onSideline?.(text);
          break;
        }
        case 'split': {
          const text = cutSelection();
          if (text) onSplit?.(text);
          break;
        }
      }
    },
    [
      activeIndex,
      changeType,
      cutSelection,
      ensureFocus,
      getSelectionText,
      handleInput,
      insertTodo,
      onSideline,
      onSplit,
      stampCurrentBlock,
      toggleCheck,
      wrapSelectionMarkers,
    ]
  );

  apiRef.current = {
    runAction,
    setBlockType: changeType,
    insertTodo,
    getSelectionText,
    cutSelection,
    cloneSelection,
    insertText,
    stampCurrentBlock,
    wrapSelectionInToggle,
    focus: ensureFocus,
  };

  /* ------------------------------------------------------------ keyboard */

  const indentBlock = useCallback(
    (index: number, delta: number) => {
      const block = blocks[index];
      const prev = prevVisible(index);
      const ceiling = prev >= 0 ? blocks[prev].indent + 1 : 0;
      const target =
        delta > 0
          ? Math.min(block.indent + 1, ceiling, MAX_INDENT)
          : Math.max(block.indent - 1, 0);
      if (target === block.indent) return false;

      const shift = target - block.indent;
      const [start, end] = descendantRange(blocks, index);
      const next = blocks.map((b, i) => {
        if (i === index) return { ...b, indent: target };
        if (i >= start && i < end) {
          return { ...b, indent: Math.max(0, Math.min(b.indent + shift, MAX_INDENT)) };
        }
        return b;
      });

      const el = elRefs.current[block.id];
      commit(applyAutoCheck(next), { id: block.id, offset: el ? caretOffsetIn(el) : 0 });
      return true;
    },
    [blocks, commit, prevVisible]
  );

  const markdownShortcut = useCallback(
    (index: number, before: string): boolean => {
      const block = blocks[index];
      if (block.type !== 'text') return false;

      const patterns: Array<[RegExp, Partial<Block>]> = [
        [/^\[[ ]?\]$/, { type: 'todo', checked: false }],
        [/^\[[xX]\]$/, { type: 'todo', checked: true }],
        [/^[-*]$/, { type: 'bullet' }],
        [/^#$/, { type: 'h1' }],
        [/^##$/, { type: 'h2' }],
        [/^###$/, { type: 'h3' }],
        [/^>$/, { type: 'toggle' }],
      ];

      for (const [pattern, patch] of patterns) {
        if (!pattern.test(before)) continue;
        const rest = block.text.slice(before.length);
        const next = blocks.map((b, i) =>
          i === index
            ? {
                ...b,
                ...patch,
                text: rest,
                stamp: b.stamp ?? (autoStamp ? formatStamp() : null),
              }
            : b
        );
        commit(applyAutoCheck(next), { id: block.id, offset: 0 });
        return true;
      }
      return false;
    },
    [autoStamp, blocks, commit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      const block = blocks[index];
      const el = elRefs.current[block.id];
      if (!el) return;

      const offset = caretOffsetIn(el);
      const length = plainLength(block.text);
      lastCaret.current = { id: block.id, offset };

      // Configurable actions win over the built-in editing keys.
      for (const [action, binding] of Object.entries(keymap) as Array<[ActionId, string]>) {
        if (matchesBinding(e, binding)) {
          e.preventDefault();
          runAction(action);
          return;
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (!indentBlock(index, -1) && block.type !== 'text') changeType('text');
          tabArmed.current = null;
          return;
        }
        tabArmed.current = { id: block.id, at: Date.now(), indent: block.indent };
        indentBlock(index, 1);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();

        // Tab-then-Enter is the default way to start a todo on a normal line.
        const armed = tabArmed.current;
        tabArmed.current = null;
        if (
          armed &&
          armed.id === block.id &&
          Date.now() - armed.at < 1200 &&
          block.type !== 'todo'
        ) {
          const next = blocks.map((b, i) =>
            i === index ? { ...b, type: 'todo' as BlockType, checked: false, indent: armed.indent } : b
          );
          commit(applyAutoCheck(next), { id: block.id, offset });
          return;
        }

        // Empty list item: step back out instead of stacking blank items.
        if (block.text === '' && (block.type === 'todo' || block.type === 'bullet')) {
          if (block.indent > 0) {
            indentBlock(index, -1);
          } else {
            const next = blocks.map((b, i) =>
              i === index ? { ...b, type: 'text' as BlockType, checked: false } : b
            );
            commit(applyAutoCheck(next), { id: block.id, offset: 0 });
          }
          return;
        }

        const cut = plainToMarkdownOffset(block.text, offset);
        const head = balanceMarkers(block.text.slice(0, cut));
        const tail = balanceMarkers(block.text.slice(cut));

        // Enter on a todo always yields another todo; toggles open a child line.
        let nextType: BlockType = 'text';
        let nextIndent = block.indent;
        if (!e.shiftKey) {
          if (block.type === 'todo' || block.type === 'bullet') {
            nextType = block.type;
          } else if (block.type === 'toggle') {
            nextIndent = Math.min(block.indent + 1, MAX_INDENT);
          }
        }

        const created = makeBlock({
          type: nextType,
          indent: nextIndent,
          text: tail,
          stamp: autoStamp ? formatStamp() : null,
        });

        const next = blocks.map((b, i) => (i === index ? { ...b, text: head } : b));
        next.splice(index + 1, 0, created);
        commit(applyAutoCheck(next), { id: created.id, offset: 0 });
        return;
      }

      if (e.key === ' ') {
        const before = el.textContent?.slice(0, offset) ?? '';
        if (before && !before.includes(' ') && markdownShortcut(index, before)) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Backspace' && offset === 0 && window.getSelection()?.isCollapsed) {
        if (block.type !== 'text') {
          e.preventDefault();
          const next = blocks.map((b, i) =>
            i === index ? { ...b, type: 'text' as BlockType, checked: false, collapsed: false } : b
          );
          commit(applyAutoCheck(next), { id: block.id, offset: 0 });
          return;
        }
        if (block.indent > 0) {
          e.preventDefault();
          indentBlock(index, -1);
          return;
        }
        const prev = prevVisible(index);
        if (prev >= 0) {
          e.preventDefault();
          const prevBlock = blocks[prev];
          const caret = plainLength(prevBlock.text);
          const next = blocks
            .map((b, i) => (i === prev ? { ...b, text: prevBlock.text + block.text } : b))
            .filter((_, i) => i !== index);
          commit(applyAutoCheck(next.length ? next : [makeBlock()]), {
            id: prevBlock.id,
            offset: caret,
          });
        }
        return;
      }

      if (e.key === 'Delete' && offset === length && window.getSelection()?.isCollapsed) {
        const following = nextVisible(index);
        if (following >= 0) {
          e.preventDefault();
          const merged = block.text + blocks[following].text;
          const next = blocks
            .map((b, i) => (i === index ? { ...b, text: merged } : b))
            .filter((_, i) => i !== following);
          commit(applyAutoCheck(next), { id: block.id, offset });
        }
        return;
      }

      const singleLine = el.getBoundingClientRect().height < 40;

      if (e.key === 'ArrowUp' && (offset === 0 || singleLine)) {
        const prev = prevVisible(index);
        if (prev >= 0) {
          e.preventDefault();
          pendingCaret.current = { id: blocks[prev].id, offset: plainLength(blocks[prev].text) };
          setBlocks((current) => [...current]);
        }
        return;
      }

      if (e.key === 'ArrowDown' && (offset === length || singleLine)) {
        const following = nextVisible(index);
        if (following >= 0) {
          e.preventDefault();
          pendingCaret.current = { id: blocks[following].id, offset: 0 };
          setBlocks((current) => [...current]);
        }
      }
    },
    [
      autoStamp,
      blocks,
      changeType,
      commit,
      indentBlock,
      keymap,
      markdownShortcut,
      nextVisible,
      prevVisible,
      runAction,
    ]
  );

  /* -------------------------------------------------------------- render */

  const placeholder = blocks.length === 1 && blocks[0].text === '' ? 'Start typing…' : '';

  return (
    <div className="block-editor" ref={containerRef}>
      {blocks.map((block, index) => {
        if (!visible[index]) return null;
        const collapsedCount =
          block.type === 'toggle' && block.collapsed ? descendantRange(blocks, index)[1] - index - 1 : 0;

        return (
          <div
            key={block.id}
            className={`block-row block-row-${block.type}${block.checked ? ' is-checked' : ''}`}
            style={{ marginLeft: block.indent * 18 }}
          >
            <div className="block-gutter">
              {block.type === 'todo' && (
                <button
                  type="button"
                  className={`block-check${block.checked ? ' checked' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleCheck(index)}
                  aria-label={block.checked ? 'Uncheck' : 'Check'}
                >
                  {block.checked && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )}
              {block.type === 'toggle' && (
                <button
                  type="button"
                  className={`block-caret${block.collapsed ? ' collapsed' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleCollapse(index)}
                  aria-label={block.collapsed ? 'Expand' : 'Collapse'}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="8 5 18 12 8 19" />
                  </svg>
                </button>
              )}
              {block.type === 'bullet' && <span className="block-bullet">•</span>}
            </div>

            <div
              ref={(el) => {
                elRefs.current[block.id] = el;
              }}
              className="block-text"
              data-block-id={block.id}
              data-placeholder={index === 0 ? placeholder : ''}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              onInput={() => handleInput(block.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onKeyUp={() => rememberCaret(block.id)}
              onMouseUp={() => rememberCaret(block.id)}
              onBlur={() => rememberCaret(block.id)}
            />

            {collapsedCount > 0 && (
              <button
                type="button"
                className="block-collapsed-count"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleCollapse(index)}
                title="Expand"
              >
                {collapsedCount}
              </button>
            )}

            {block.stamp && <span className="block-stamp">{block.stamp}</span>}
          </div>
        );
      })}
    </div>
  );
}
