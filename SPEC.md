# HoverThought

The reforge replaces automatic note windows with an ambient capture and retrieval loop.

- A configurable global shortcut opens a pre-warmed Quick Capture input. Enter saves exact plain text to SQLite and dismisses it; Shift+Enter adds a line; Escape discards an uncommitted draft.
- Each successful capture follows [RECORD_FORMAT.MD](RECORD_FORMAT.MD). At commit it routes to the persisted Primary project, or Waiting Room when Primary is unset. Every capture belongs to exactly one container.
- The context panel supports creating a project and setting or clearing Primary. The editor's Move control reassigns a capture without changing its identity; a changed destination advances its semantic timestamp.
- A small left-edge anchor reveals contexts, then captures, then a preview. Clicking a capture deliberately opens the reusable editor.
- Escape and the editor's × save the current text and title before dismissing. Neither deletes nor reassigns the capture.
- Legacy notes remain preserved and readable. They are no longer the new-record creation path.

Implementation and verification status are in [STATUS.md](STATUS.md); this document does not certify unfinished behavior.
