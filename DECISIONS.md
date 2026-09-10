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

Verified source commit `c10cc94` in [Release run 34531056044](https://github.com/jayalexandermg/notary/actions/runs/34531056044): all four matrix jobs succeeded and uploaded installers. The Windows MSI itself was opened read-only and its ProductVersion and UpgradeCode matched the locked values. Subsequent native runtime changes require a new four-target run before Phase 2 completion.

## Native capture readiness and workspace restoration

Actual Windows measurements exposed 160–193 ms readiness in the initial path. Merely dispatching from a worker did not solve it (258 ms observed). The final path starts its timer in the original OS accelerator callback, exits that callback promptly, and emits the preparation event to the existing input before native placement/show/focus work. The readiness boundary remains painted, focused, editable input: the frontend waits two animation frames and checks DOM focus/editability; the backend checks native visibility and focus. Scheduling and native activation remain included in the measurement.

The revised path produced ten consecutive invocations of 41.6–83.1 ms, including the first invocation after restart. Two subsequent restart checks measured 59.9 and 73.9 ms. These are local Windows debug-runtime observations, not a universal performance guarantee. Debug-only stage diagnostics retain evidence of native focus and frontend acknowledgment timing.

Remember the last external workspace window across anchor browsing so an editor does not return keyboard focus to the tiny anchor. Windows handles belonging to HoverThought are excluded from this remembered workspace. Restore uses ordinary foreground activation without thread attachment, input injection or repeated activation requests. Cross-thread activation briefly reported a null foreground window after a mouse dismissal; confirmation now allows up to 50 ms for that single request to settle, off the native event loop. Escape and the close button both pass actual native save/hide/restoration checks. Closing the reference application or OS refusal remains an explicit failure result, not a claimed successful restoration.

## Phase 2 completion evidence

Final runtime source `03819c4b30a8e55c6777ad4a6c24bcc3a0efe0dd` passed [Release run 34539806205](https://github.com/jayalexandermg/notary/actions/runs/34539806205) on Linux, Windows, macOS Apple Silicon and macOS Intel. Each job passed native tests, built installers and uploaded a nonempty artifact. The resulting Windows MSI Property table again preserves ProductVersion `0.1.9` and UpgradeCode `{A920A0E7-BEBF-5189-BF5F-B75077BB8AEB}`. Native verification and the release gate jointly satisfy Phase 2; STATUS records individual record-format gates and remaining hardening risks. Stop at the owner's requested Phase 2 check-in before beginning Primary Project work.
