# HoverThought

The reforge replaces automatic note windows with an ambient capture and retrieval loop.

- A configurable global shortcut opens a pre-warmed Quick Capture input. Enter saves exact plain text to SQLite and dismisses it; Shift+Enter adds a line; Escape discards an uncommitted draft.
- Each successful capture follows [RECORD_FORMAT.MD](RECORD_FORMAT.MD). At commit it routes to the persisted Primary project, or Waiting Room when Primary is unset. Every capture belongs to exactly one container.
- The context panel supports creating a project and setting or clearing Primary. The editor's Move control reassigns a capture without changing its identity; a changed destination advances its semantic timestamp.
- A small left-edge anchor reveals root contexts. Hover exposes immediate children or a thought preview in the other of two fixed content areas. Further depth replaces earlier context inside the same bounded panel; the hovered list and its scroll position remain fixed. Clicking a capture deliberately opens the reusable editor.
- The compressed header exposes the current ancestor path and a direct sibling-context list. Child contexts can be created inside an existing project. Existing container identity and single-container capture membership remain unchanged; navigation does not reassign captures.
- Escape and the editor's × save the current text and title before dismissing. Neither deletes nor reassigns the capture.
- Legacy notes remain preserved and readable. They are no longer the new-record creation path.

Implementation and verification status are in [STATUS.md](STATUS.md); this document does not certify unfinished behavior.
