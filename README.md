# HoverThought HUD

A minimal, always-on-top sticky notes desktop app. Create floating notes that persist across sessions, with per-note transparency, drag-and-drop positioning, and a clean interface.

Built with [Tauri 2](https://tauri.app/) (Rust + React + TypeScript).

## Features

- **Floating notes** - Each note is a separate always-on-top window
- **Persistent** - Notes save automatically (content, position, size, opacity)
- **Note management** - Create, hide, reopen, rename, merge, and delete notes
- **Transparency control** - Per-note opacity slider
- **Todo checkboxes** - Type `- [ ]` for interactive checkboxes
- **Merge notes** - Combine multiple notes into one
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
- **Resize** - Drag the window edges
- **Opacity** - Hover near the bottom to reveal the opacity slider
- **Hide (X)** - Closes the note window; reopenable from the menu
- **Delete (trash icon)** - Permanently removes the note
- **Merge** - Open the menu, click "Merge" next to any note to combine it into the current one

### Todo checkboxes
Type `- [ ]` followed by your task text. Click the checkbox to toggle it.

```
- [ ] Unchecked item
- [x] Completed item
```

### Keyboard shortcuts
- `Ctrl+Alt+N` - Create new note
- `Ctrl+Alt+H` - Hide/show all notes

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
