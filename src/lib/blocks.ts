/**
 * Block document model.
 *
 * A note's content is stored as plain text so it stays greppable, mergeable and
 * backwards compatible with notes written before the block editor existed.
 * Each line maps to exactly one block:
 *
 *   {indent}# / ## / ###   heading 1..3
 *   {indent}- [ ] / - [x]  todo (unchecked / checked)
 *   {indent}-              bullet
 *   {indent}▾ / ▸          toggle (expanded / collapsed)
 *   {indent}               plain text
 *
 * Indent is two spaces per level. Nesting is purely indentation based: the
 * children of a block are the following lines with a deeper indent. A trailing
 * ` @[stamp]` marks a date/time tagged block.
 *
 * Inline formatting uses markdown markers: **bold**, *italic*, `code`.
 */

export type BlockType = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'todo' | 'toggle';

export interface Block {
  id: string;
  type: BlockType;
  indent: number;
  text: string;
  checked: boolean;
  collapsed: boolean;
  stamp: string | null;
}

export const MAX_INDENT = 6;
export const INDENT_UNIT = '  ';

export const TOGGLE_OPEN = '▾';
export const TOGGLE_CLOSED = '▸';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `b${idCounter}`;
}

export function makeBlock(partial: Partial<Block> = {}): Block {
  return {
    id: nextId(),
    type: 'text',
    indent: 0,
    text: '',
    checked: false,
    collapsed: false,
    stamp: null,
    ...partial,
  };
}

const STAMP_RE = /\s*@\[([^\]]+)\]\s*$/;

export function parseBlocks(content: string): Block[] {
  if (!content) return [makeBlock()];

  return content.split('\n').map((rawLine) => {
    let line = rawLine.replace(/\s+$/, '');

    let stamp: string | null = null;
    const stampMatch = line.match(STAMP_RE);
    if (stampMatch) {
      stamp = stampMatch[1];
      line = line.slice(0, stampMatch.index);
    }

    const indentMatch = line.match(/^ */);
    const indentSpaces = indentMatch ? indentMatch[0].length : 0;
    const indent = Math.min(Math.floor(indentSpaces / 2), MAX_INDENT);
    const body = line.slice(indentSpaces);

    const todo = body.match(/^- \[([ xX])\] ?(.*)$/);
    if (todo) {
      return makeBlock({
        type: 'todo',
        indent,
        text: todo[2],
        checked: todo[1].toLowerCase() === 'x',
        stamp,
      });
    }

    const toggle = body.match(/^([▾▸]) ?(.*)$/);
    if (toggle) {
      return makeBlock({
        type: 'toggle',
        indent,
        text: toggle[2],
        collapsed: toggle[1] === TOGGLE_CLOSED,
        stamp,
      });
    }

    const bullet = body.match(/^[-*] ?(.*)$/);
    if (bullet) {
      return makeBlock({ type: 'bullet', indent, text: bullet[1], stamp });
    }

    const heading = body.match(/^(#{1,3}) ?(.*)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      return makeBlock({ type: `h${level}` as BlockType, indent, text: heading[2], stamp });
    }

    return makeBlock({ type: 'text', indent, text: body, stamp });
  });
}

export function blockPrefix(block: Block): string {
  switch (block.type) {
    case 'h1':
      return '# ';
    case 'h2':
      return '## ';
    case 'h3':
      return '### ';
    case 'bullet':
      return '- ';
    case 'todo':
      return block.checked ? '- [x] ' : '- [ ] ';
    case 'toggle':
      return `${block.collapsed ? TOGGLE_CLOSED : TOGGLE_OPEN} `;
    default:
      return '';
  }
}

export function serializeBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const indent = INDENT_UNIT.repeat(block.indent);
      const stamp = block.stamp ? ` @[${block.stamp}]` : '';
      return `${indent}${blockPrefix(block)}${block.text}${stamp}`;
    })
    .join('\n');
}

/**
 * A parent todo is checked exactly when all of its direct todo children are.
 * Walking backwards makes multi-level propagation settle in a single pass.
 */
export function applyAutoCheck(blocks: Block[]): Block[] {
  const next = blocks.map((b) => ({ ...b }));

  for (let i = next.length - 1; i >= 0; i--) {
    const parent = next[i];
    if (parent.type !== 'todo') continue;

    let hasChildren = false;
    let allChecked = true;

    for (let j = i + 1; j < next.length; j++) {
      if (next[j].indent <= parent.indent) break;
      if (next[j].indent === parent.indent + 1 && next[j].type === 'todo') {
        hasChildren = true;
        if (!next[j].checked) allChecked = false;
      }
    }

    if (hasChildren) parent.checked = allChecked;
  }

  return next;
}

/** Index range [start, end) of the blocks nested under `index`. */
export function descendantRange(blocks: Block[], index: number): [number, number] {
  const indent = blocks[index].indent;
  let end = index + 1;
  while (end < blocks.length && blocks[end].indent > indent) end++;
  return [index + 1, end];
}

/** Which blocks are visible — everything under a collapsed toggle is hidden. */
export function visibleFlags(blocks: Block[]): boolean[] {
  const flags: boolean[] = [];
  let hiddenBelow: number | null = null;

  for (const block of blocks) {
    if (hiddenBelow !== null && block.indent > hiddenBelow) {
      flags.push(false);
      continue;
    }
    hiddenBelow = null;
    flags.push(true);
    if (block.type === 'toggle' && block.collapsed) hiddenBelow = block.indent;
  }

  return flags;
}

export function hasChildren(blocks: Block[], index: number): boolean {
  const [start, end] = descendantRange(blocks, index);
  return end > start;
}

/* -------------------------------------------------------------------------
 * Inline markdown
 * ---------------------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Markdown → HTML for a single block's inline content. */
export function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  return html;
}

/** HTML → markdown, reading back whatever the browser produced while editing. */
export function serializeInline(node: Node): string {
  let out = '';

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? '';
      return;
    }
    if (!(child instanceof HTMLElement)) return;

    const tag = child.tagName;
    if (tag === 'BR') return;

    const inner = serializeInline(child);
    if (!inner) return;

    const style = child.getAttribute('style') ?? '';
    const bold = tag === 'B' || tag === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/i.test(style);
    const italic = tag === 'I' || tag === 'EM' || /font-style:\s*italic/i.test(style);

    if (tag === 'CODE') out += `\`${inner}\``;
    else if (bold && italic) out += `**\*${inner}\***`;
    else if (bold) out += `**${inner}**`;
    else if (italic) out += `*${inner}*`;
    else out += inner;
  });

  return out;
}

/** Length of `md` with the formatting markers removed. */
export function plainLength(md: string): number {
  let length = 0;
  let i = 0;
  while (i < md.length) {
    if (md.startsWith('**', i)) {
      i += 2;
      continue;
    }
    if (md[i] === '*' || md[i] === '`') {
      i += 1;
      continue;
    }
    i += 1;
    length += 1;
  }
  return length;
}

/** Convert a caret offset in the rendered text to an offset in the markdown. */
export function plainToMarkdownOffset(md: string, plainOffset: number): number {
  let plain = 0;
  let i = 0;
  while (i < md.length && plain < plainOffset) {
    if (md.startsWith('**', i)) {
      i += 2;
      continue;
    }
    if (md[i] === '*' || md[i] === '`') {
      i += 1;
      continue;
    }
    i += 1;
    plain += 1;
  }
  return i;
}

/**
 * Splitting mid-line can orphan a marker (`**bo` + `ld**`). Close whatever is
 * left dangling so both halves still render as the user wrote them.
 */
export function balanceMarkers(md: string): string {
  let out = md;
  const bold = (out.match(/\*\*/g) ?? []).length;
  if (bold % 2 === 1) out += '**';
  const code = (out.match(/`/g) ?? []).length;
  if (code % 2 === 1) out += '`';
  const italic = (out.replace(/\*\*/g, '').match(/\*/g) ?? []).length;
  if (italic % 2 === 1) out += '*';
  return out;
}

export function formatStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
