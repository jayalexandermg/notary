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

Provisional default logical bounds (B2 update, 2026-09-10): anchor 24×48; Quick Capture 432×80 (previously 680×180); editor 330×222 (previously 560×380). Retrieval stays 350 pixels wide and adjusts its height to the immediate layer, capped at 420. These remain provisional implementation defaults, not finalized production dimensions. Saved editor dimensions still take precedence over defaults. No new surface has a fullscreen or maximize action.

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

## 2026-09-10 — record-format audit at de63f2e: accepted limits and required future checks

1. **Gate 6 — no UI prompt blocks Quick Capture.** Verified by code inspection only; no automated test exists for this gate. Accepted as-is for v1. If `src/components/QuickCapture.tsx` changes in a way that could reintroduce a blocking prompt, explicitly flag that possibility and re-evaluate the gate rather than relying on this acceptance note alone.

2. **Gate 11 — derived_from cardinality and UUIDv7 validation.** Enforced in the create-capture constructor (`Database::create_capture`, through `validate_source_id` in `src-tauri/src/captures.rs`), not at the type level: `Option<String>` does not itself validate the format. This is correct today because there is exactly one capture-record write path. Any future path that can create a capture record — including Combine returning from deferral, an import feature, or any other writer — **MUST** route through the same validation or re-implement its zero-or-one UUIDv7 validation. Explicitly flag this as a required check whenever a new capture-record write path is proposed.

## 2026-09-10 — B2 active-surface styling checkpoint

**Deliberate product decision — accepted by the owner:** removal of the editor's per-note opacity slider is separate from the B2 styling port. Per-note opacity conflicts with the ambient model; engaged cards remain fully opaque. The removal initially exceeded the requested styling scope and was subsequently accepted explicitly. Stored opacity values were preserved, not reset or migrated.

Port the CSS treatment from the owner's `ht-surfaces-b2-final.html` into Quick Capture and the engaged editor only. Scope the reference's 11 tokens to `.ht-surface` so the anchor/reveal/preview palette remains unchanged. Keep existing component state machines and native drag/resize handlers; do not copy the prototype's desktop, resize, badge or positioning scaffolding. The material is an opaque gradient. The separately accepted opacity-control decision is recorded above; pin changes still preserve the stored opacity field. The noninteractive destination displays Waiting Room for the current capture route; an editor with another container ID displays that ID rather than inventing a name. Resolving future project display names is outside this presentation pass.

Gate 6 was re-inspected because QuickCapture.tsx changed: only material classes and footer presentation changed; the existing commit/discard handlers remain intact and no blocking metadata/project input was added. A browser test against simulated IPC verified one exact multiline commit, draft clearing and zero input/select elements besides the textarea. This does not establish native timing or future routing behavior. No new capture-record writer was added, so Gate 11's constructor boundary is unchanged.

The outward glow cannot be treated as complete merely because its exact four-shadow declaration is present. The existing webviews fill their native bounds and `globals.css` clips overflow at html/body/root. The 20px/60px bloom and 22px/52px elevation extend beyond that boundary. The owner subsequently authorized transparent outer gutters, conditional on real Windows click-through verification; see the stopped trial below. STATUS records the visual requirement as incomplete, not a PASS.

## 2026-09-10 — transparent-gutter trial stopped at the Windows input gate

The owner authorized larger outer window bounds while preserving visible cards of 432×80 and 330×222 logical pixels. A temporary 96px-per-side CSS gutter and 192-logical-pixel increase in window width/height were tested locally. This was a trial value, not a verified minimum or an accepted production gutter. The native capture window measured 780×340 physical pixels at scale 1.25 (624×272 logical), while its WebView viewport measured 525×229 CSS pixels. Mixing these scales compressed the visible card, as the owner also demonstrated; this trial did not satisfy the fixed-card-size requirement.

A real Windows click at capture-window-relative (12,12), outside the card in a transparent corner over dedicated Notepad, left the capture window focused and changed its active DOM element from TEXTAREA to BODY. Plain transparent gutters therefore failed click-through. A second, debug-only native subclass experiment returning HTTRANSPARENT outside the card did not establish reliable cross-application input: the Windows automation tool twice refused the underlying Notepad click at (666,320), identifying `msedgewebview2.exe "Chrome Legacy Window"` as the target instead. Those two refused attempts were not delivered physical clicks and are not counted as successful click tests. Microsoft's [WM_NCHITTEST documentation](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest) limits HTTRANSPARENT forwarding to windows in the same thread; this does not provide a cross-process solution.

Honor the owner's stop condition. The temporary runtime/CSS changes were restored byte-for-byte to their pre-trial state, preserving the earlier B2 work. No gutter implementation is accepted or shipped; no opaque gutter, cursor-polling workaround, new window topology, routing/domain change, or Phase 3 work is introduced. Trial source, native logs and read-only observations remain in ignored `.reforge-evidence/gutter-trial/` for diagnosis. Final native appearance, card dimensions, focus/hide checks, post-gutter latency qualification and four-target release verification remain open. The two experimental readiness samples (61.3050ms and 79.6124ms) do not qualify a final implementation.

## 2026-09-10 — owner drops gutters; inward-light replacement selected

The owner permanently drops transparent gutters and further native hit-testing work for this styling pass: the implementation/verification cost is disproportionate to the visual effect. Keep the trial reverted. Replace the outward material lighting with the exact contained treatment in `ht-surfaces-b2-inward.html`: inward radial light, inset shadows, an inside top highlight and inner ring, with rim opacity 0.40. Do not infer missing CSS values from this description. Visible/default sizes remain 432×80 and 330×222; native window bounds and compositing settings remain unchanged. Inspect existing rounded-corner behavior on Windows and flag any required window configuration change before implementing it. The replacement remains presentation-only and limited to Quick Capture and the editor.

The replacement file was not available in the message attachments, Downloads, or repository at this checkpoint; only the earlier `ht-surfaces-b2-final.html` was found. Implementation waits for the exact replacement CSS. This supersedes the prior suggestion to resume gutter experiments.

## 2026-09-10 — inward material implemented; qualification remains blocked

The owner supplied `ht-surfaces-b2-inward.html` after the missing-reference checkpoint. Port its exact 11 tokens, radial-plus-linear fill, three inset surface shadows, inside top highlight and inset inner ring to the existing shared active-surface class. Keep the pip's reference glow contained inside the card; do not add any outward card shadow. No window bounds, transparent flags, framework, routing, capture writer or editor persistence logic changed in this inward replacement. The earlier provisional 432×80 / 330×222 defaults remain in force.

On this Windows machine, capture corners visibly show the underlying white Notepad through the pre-existing transparent window; the opaque card itself does not show through. Existing `.transparent(true).decorations(false).shadow(false)` flags are unchanged. This is not a newly added transparency solution or a claim that Windows 11 frame rounding was independently proven to be the mechanism.

The 13-sample native readiness run includes a 128.9790ms fresh-process failure. Retain and flag it as a blocker; do not drop it or reinterpret it as a passing result. This measurement establishes a threshold failure on the tested machine, not proof that the CSS caused a regression. Investigating/changing native focus orchestration is outside this presentation-only change. Complete the remaining verification evidence without marking the styling task fully qualified.
