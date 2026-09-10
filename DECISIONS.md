# Reforge decisions

## 2026-09-10 — baseline and preservation

The supplied checkout was `codex/capture-iterations-v2` at `4a71b9d`, predating the locked baseline, with uncommitted editor changes. Preserved those five tracked files and `src/lib/noteColors.ts` in Git stash `a49978d923b753c724e85627c95a319f8c72d975` (message: `Preserve pre-reforge edits from codex/capture-iterations-v2`). The requested branch `reforge/hoverthought-capture` starts at verified tag v0.1.9 / `4c2bb4158bfa1d48d138ff5087425bd56ba69f3d`. Existing logs were left in place.

## Runtime topology

Three reusable native windows: Quick Capture, anchor/retrieval, and engaged editing. Quick Capture is initialized once and hidden between uses. The anchor's native bounds expand only to the current compact retrieval surface and shrink back to the mark, so there is no desktop-sized invisible hit-test surface. One editor avoids the cold window-per-record path and keeps full editing an exception state. Hover retrieval does not request keyboard focus. Deliberate capture or editing does.

The previous hotkey wrote a legacy note and called `spawn_note_window`, which booted a new webview. The new hotkey shows and focuses an existing input; its commit performs the record write before hiding. React's input focus acknowledgment supplies the readiness timing boundary.

## Storage and legacy survival

Add capture, container and presentation tables beside legacy `notes`. Do not rewrite existing IDs, timestamps, content, or presentation. New semantic updates target only changed semantic columns; unknown JSON fields and additional SQL columns survive. Separate presentation writes cannot bump a capture's `updated_at`.

KEEP: application identity, packaging, SQLite, shared palette, trailing-space block grammar. SALVAGE CANDIDATES: block parsing and safe inline rendering, retained for later use; the first preview displays exact plain text. EDIT MODE ONLY: full note editing. DEFER: the existing rich editor, formatting toolbar, Combine, Split/Clone, Sideline, universal controls and customization matrix. The first editor uses native textarea undo to avoid bringing known block-operation undo limitations into the proof of capture safety. Existing components remain in the repository and are excluded from the new entry-point bundle.

## Platform boundaries and verification

Use cross-platform Tauri positioning, lifecycle, focus and global-shortcut APIs. Any required foreground-window restoration uses a small Windows-only boundary, with native hide behavior on other platforms. Native Windows runtime measurements are required before calling the vertical slice complete. Linux/macOS runtime access is unavailable locally; their release matrix remains intact.

The provisional global accelerator is `Ctrl+Alt+Shift+H`. Shortcut replacement registers the candidate before unregistering the current binding so a collision does not remove a working accelerator. Failed registration is visible through the anchor's shortcut control.

Default logical bounds: anchor 24×48; capture 680×180; editor 560×380. Retrieval stays 350 pixels wide and adjusts its height to the immediate layer, capped at 420. These are implementation defaults, not screenshot styling requirements. No new surface has a fullscreen or maximize action.

Local toolchain installation is confined to ignored `.reforge-tools`; system PATH is unchanged. Rust 1.96.0 was selected after Windows permitted it under the existing Smart App Control policy, whereas stable 1.98.1 was blocked. A subsequent generated dependency helper was also blocked. The owner reported switching Smart App Control off; the subsequent native build and all 15 Rust tests passed. No Windows security setting was changed by the agent.

## Release workflow continuity

The existing four-target Release workflow is load-bearing and remains enabled. Added manual dispatch so the same installer build can be verified on the reforge branch without publishing a product tag. Tag-triggered runs retain their existing draft Release creation and asset attachment behavior. Manual runs omit the release tag/name and retain built installers as Actions artifacts, failing when no installer is produced. Added native tests and explicit checks for application identity, WiX upgradeCode, installer targets, version sync and IPC naming. This intentional revision makes branch verification possible without restoring the removed window topology. Phase 2 cannot pass until an actual four-target Release workflow run succeeds; local compilation alone is insufficient.
