# HoverThought

A minimal, always-on-top sticky notes desktop app. Create floating notes that persist across sessions, with per-note transparency, drag-and-drop positioning, and a clean interface.

Built with [Tauri 2](https://tauri.app/) (Rust + React + TypeScript).

## Features

- **Floating notes** - Each note is a separate always-on-top window
- **Persistent** - Notes save automatically (content, position, size, opacity, color)
- **Note management** - Create, hide, reopen, rename, combine, split, and delete notes
- **Rich blocks** - Headings, bullets, todos and collapsible toggles, with **bold**/*italic*/`code`
- **Native todos** - Todos are ordinary lines, not a mode; nest them and parents auto-check
- **Formatting toolbar** - Collapsible toolbar with formatting and quick actions
- **Transparency & color** - Per-note opacity slider and colour palette
- **Universal mode** - Apply opacity/colour/size to every open note at once
- **Custom keybindings** - Rebind editor actions and the global hotkeys
- **Sideline tray** - Stash several snippets, then drop them in wherever you need
- **Cross-platform** - Windows, macOS, Linux

## Install

### Download (Recommended)

Download the latest release for your platform from [Releases](https://github.com/jayalexandermg/notary/releases).

| Platform | File |
|----------|------|
| Windows | `.exe` or `.msi` |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x86_64) |
| Linux | `.AppImage`, `.deb`, or `.rpm` |

### Build from source

**Prerequisites:** [Node.js](https://nodejs.org/), [Rust](https://rustup.rs/), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/jayalexandermg/notary.git
cd notary
corepack enable
pnpm install
pnpm tauri build
```

The built executable will be in `src-tauri/target/release/`.

## Usage

### Creating notes
- Click the **+** button on any note's titlebar to open the notes menu
- Click **New Note** to create a new note

### Managing notes
- **Title** - Click the title text to rename
- **Move** - Drag the titlebar
- **Resize** - Drag the window edges or the corner grip
- **Size presets** - Open the Format toolbar for Mini / Compact / Standard / Full screen
- **Opacity & colour** - In the gear (settings) menu
- **Hide (X)** - Closes the note window; reopenable from the settings menu
- **Delete (trash icon)** - Permanently removes the note
- **Combine** - Gear menu → "Combine" next to any note. Each note's content lands in its
  own toggle, and the source note is closed rather than deleted.
- **Split** - Select text, right-click → "Split into new note"

### Todos
Todos are a normal kind of line, not a mode — add or remove them anywhere, any time.

- Press **Tab then Enter** on any line to turn it into a todo
- Or type `[]` followed by a space
- **Enter** on a todo always starts another todo
- **Tab** indents a todo under the one above it
- When every child of a todo is checked, the parent checks itself
- Checked todos are struck through and slightly faded

```
- [ ] Unchecked item
- [x] Completed item
  - [x] Nested child
```

### Other blocks
- `# `, `## `, `### ` + space — headings
- `- ` + space — bullet
- `> ` + space — collapsible toggle (houses everything indented beneath it)

### Keyboard shortcuts
- `Ctrl+Alt+N` - Create new note
- `Ctrl+Alt+H` - Hide/show all notes

Editor shortcuts (bold, italic, headings, todo, toggle, timestamp, sideline, split)
and both global hotkeys can be rebound in **Settings → Keyboard shortcuts**.

*Note: Global shortcuts may not work in all environments (e.g., WSLg).*

## Development

```bash
pnpm install
pnpm tauri dev
```

## Tech Stack

- **Backend:** Rust, Tauri 2, SQLite (rusqlite)
- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Storage:** Local SQLite database

## Roadmap

- [ ] Collapsible note sections
- [ ] Linked notes
- [ ] Infinite canvas workspace (separate app, shared database)
- [ ] Real-time collaboration

## License

[MIT](LICENSE)
