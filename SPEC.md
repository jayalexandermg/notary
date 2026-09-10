# HoverThought

The reforge replaces automatic note windows with an ambient capture and retrieval loop.

- A configurable global shortcut opens a pre-warmed Quick Capture input. Enter saves exact plain text to SQLite and dismisses it; Shift+Enter adds a line; Escape discards an uncommitted draft.
- Each successful capture follows [RECORD_FORMAT.MD](RECORD_FORMAT.MD). The first slice routes to Waiting Room.
- A small left-edge anchor reveals contexts, then captures, then a preview. Clicking a capture deliberately opens the reusable editor.
- Escape and the editor's × save the current text and title before dismissing. Neither deletes nor reassigns the capture.
- Legacy notes remain preserved and readable. They are no longer the new-record creation path.

Implementation and verification status are in [STATUS.md](STATUS.md); this document does not certify unfinished behavior.
