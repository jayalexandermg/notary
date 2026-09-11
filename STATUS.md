# Reforge status

Objective: implement and measure the locked HoverThought Windows vertical slice on `reforge/hoverthought-capture`.

Inspected: v0.1.9 history, legacy SQLite schema/UUIDv4 generator, hotkeys, cold note-window path, startup restoration, BlockEditor coupling, palette, shared settings/events, IPC/version checks and four-target packaging.

Completed in source: preserved earlier user edits, selected the verified baseline, reconciled RECORD_FORMAT.MD with the final amendments, added capture/presentation storage and seven focused Rust tests, connected three reusable surfaces, replaced the legacy creation/startup path, added configurable shortcut registration and readiness/commit instrumentation.

**Phase 2 complete — 2026-09-10.** Native Waiting Room Quick Capture, retrieval, edit, save/dismiss and restart checks passed, and the final runtime source passed the four-target Release workflow. Completion applies to the first Windows vertical slice, not the full reforge. Primary Project, reassignment UI, deeper Context Compression and outward capture dragging remain for subsequent phases. Work stops here for the requested owner check-in.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen frontend dependencies | PASS | `pnpm install --frozen-lockfile --store-dir .pnpm-store` |
| Frontend production build | PASS | `pnpm build`: TypeScript and Vite completed; editor/retrieval emitted separate chunks |
| IPC naming | PASS | `node scripts/check-ipc-naming.mjs`: 23 files scanned |
| Version sync | PASS | `node scripts/check-version-sync.mjs`: all three remain 0.1.9 |
| Diff whitespace | PASS | `git diff --check` |
| Quick Capture UI | PASS, simulated IPC | Playwright: exact multiline text, repeated Enter sends one commit, Escape clears an uncommitted draft, failed commit retains draft |
| Editor UI | PASS, simulated IPC | Playwright at 560×380: autosave, failed save/dismiss retains text, × and Escape call the same save/dismiss command |
| Retrieval UI | PASS, simulated IPC | Playwright at 350×420: 24×48 mark with subpixel tolerance, immediate Waiting Room layer, hover preview, deliberate engagement, return to ambient |
| Rust tests | PASS | `cargo +1.96.0 test --lib`: 15 passed, 0 failed, including all seven capture-contract tests |
| Native Windows build | PASS | `cargo +1.96.0 build` produced the Windows executable; `cargo +1.96.0 check --locked` passed |
| Release continuity checks | PASS, local | `node scripts/check-release-invariants.mjs`: identifier, WiX upgradeCode and installer targets preserved |
| Release workflow | PASS, all four targets | [Release run 34539806205](https://github.com/jayalexandermg/notary/actions/runs/34539806205), source commit `03819c4b30a8e55c6777ad4a6c24bcc3a0efe0dd`; native tests, installer builds and artifact uploads succeeded on every target |
| Built MSI continuity | PASS | Read the actual CI MSI Property table: ProductName `HoverThought`, ProductVersion `0.1.9`, UpgradeCode `{A920A0E7-BEBF-5189-BF5F-B75077BB8AEB}` |
| Windows runtime / performance | PASS, local native debug runtime | Ten consecutive invocations 41.6–83.1 ms; subsequent first-after-restart checks 59.9 and 73.9 ms. Exact native capture commit, cancellation, repeated-hotkey draft preservation, retrieval/preview, edit, Escape/× save/dismiss, external focus restoration and restart persistence observed |
| Native semantic/presentation separation | PASS | Read-only SQLite snapshots: title/content edits preserve UUID and created_at; opening/closing and pin changes leave the entire semantic record, including updated_at, unchanged |

The browser harness is `.reforge-evidence/frontend.html`. It uses the real React components with a simulated IPC backend and does not test SQLite, OS accelerators, native window bounds or foreground restoration. Its browser viewport is constrained for UI tests; it is not a fullscreen desktop product surface.

The final-source Release workflow completed successfully on Linux (4m07s), Windows (4m36s), macOS Apple Silicon (4m31s), and macOS Intel (2m03s). All four nonempty installer artifacts were available. Manual verification produced Actions artifacts; the existing tag-triggered draft Release and attachment path remains in the workflow. No product tag, product Release, installation over existing data, or main-branch merge was part of this run.

The downloaded final-source Windows installer evidence is `.reforge-evidence/release-34539806205/msi-properties.json`. MSI SHA-256: `E5C6079F1F08ACBB2931847CCB6B54251B7BA2350662BE1D5C1B360725B1AAC7`. This checks the built installer identity; an installed upgrade over a prior version remains a separate runtime check.

## Build environment

Rust stable 1.98.1 installed, but Smart App Control blocked `rustc.exe`. Official Rust 1.96.0 was permitted to run with the existing policy intact. Its build then failed because Smart App Control blocked a newly generated dependency helper. Code Integrity event 3077 names `VerifiedAndReputableDesktop` and policy GUID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. No Windows security settings were changed by this task.

The owner subsequently reported switching Smart App Control off. Native compilation and all 15 Rust tests then succeeded. Windows runtime verification completed against an isolated debug database.

## Record-format gate

The native Rust test suite executed successfully. Runtime behavior and release verification remain separate gates.

| Requirement | Gate | Source/test prepared |
| --- | --- | --- |
| UUIDv7, stable creation identity | PASS — native Rust test | `captures.rs::create_capture`; `rapid_records_have_unique_stable_v7_ids`; semantic edit test |
| Creation timestamp with offset | PASS — native Rust test | `creates_conforming_waiting_room_records_and_survives_restart` |
| schema_version 1.0 | PASS — native Rust test | Same record creation test |
| source identifies surface | PASS — native Rust test | Same test; `hoverthought/quick-capture` |
| Exactly one non-null container | PASS — native Rust test | Schema foreign key and semantic-edit rollback test |
| No metadata/project prompt | PASS — frontend | Quick Capture contains only thought input and commit/discard controls; Playwright capture tests |
| Presentation stored separately | PASS — native Rust test | `every_presentation_change_is_separate_and_never_bumps_semantic_time` |
| content/title/container mutate updated_at | PASS — native Rust test | `semantic_edits_bump_time_and_preserve_identity` |
| Presentation does not bump updated_at | PASS — native Rust test | Presentation test covers position, size, open/minimized, opacity and pin |
| Unknown fields survive read/write | PASS — native Rust test | `preserves_unknown_fields_on_read_write_and_additive_reopen` |
| derived_from is zero-or-one UUIDv7 | PASS — native Rust test | `derivation_has_at_most_one_v7_source_and_never_mutates_it` |

Native evidence uses the isolated debug database selected by `HOVERTHOUGHT_TEST_DATA_DIR`; the owner's database was not used. Read-only native WebView inspection confirms capture visible/focused with an editable textarea while active, and hidden/cleared after commit. Logical native sizes are anchor 24×48, capture 680×180 and editor 560×380, measured at 125% Windows scaling. Retrieval remains a compact immediate layer with a lightweight preview before engagement.

Measured hotkey-to-painted-focused-input samples in `.reforge-evidence/phase2-prepared.stderr.log`: 83.0763, 50.7099, 43.2100, 43.0926, 51.5797, 52.7131, 43.6126, 50.2390, 52.2407, 41.6293 ms. The successful commit measured 25.3005 ms from IPC to persisted/hidden and 33.7 ms from Enter to acknowledgment. Full app restarts in `phase2-final.stderr.log` and `phase2-confirmed.stderr.log` measured 59.8656 and 73.9237 ms respectively. An additional invocation on final source `03819c4` measured 43.4452 ms, with a 33.0 ms Enter-to-acknowledgment commit. All 13 samples after the preparation-order fix were below 100 ms. Earlier 160–258 ms failures triggered that fix as described in DECISIONS; they are not represented as passing samples.

The final native capture also persisted exactly `Phase 2 exact text\nsecond line — café  `, including its newline and two trailing spaces. Read-only evidence is exported to `.reforge-evidence/native-final-db.json`. The isolated app, localhost development server, and dedicated blank Notepad reference were stopped after verification.

Native persistence record `01a08d80-8527-7b62-80dc-a7fcab089987` retained created_at `2026-09-10T15:46:45.287384800-07:00` after content/title edits and multiple full app restarts. Saved title is `Phase 2 persistence`; content is `Phase 2 final native persistence check — saved edit`. Pin toggling changed only `presentation_state.always_on_top`. An attempted automated header drag did not change position, so native drag persistence is not claimed. Database presentation tests cover position and size separately.

The final four-target release gate and built MSI identity check passed on source `03819c4`. Subsequent completion-documentation changes do not alter that tested source. Next phase: Primary Project set/unset, automatic routing, Waiting Room fallback and capture reassignment. Advanced spatial navigation follows in Phase 4; hardening follows in Phase 5.

Self-review: fixed a potential native event-loop deadlock by dropping runtime state locks before dispatching native window work. Completion remains guarded through foreground restoration to prevent a new capture from having its focus stolen by the previous completion. The commit path confirms native visibility after hiding before acknowledging success. Browser tests exposed and verified a fix for preview activation when a context layer is replaced underneath a stationary pointer.

Assumptions: one reusable editing window and a plain-text editor with native undo are sufficient for the first slice; rich block editing remains deferred. The screenshots specify interaction and footprint only. Legacy notes are exposed read-only and new legacy Combine/creation IPC is not registered.

Unresolved risks: multi-monitor transitions and scaling combinations beyond this 125% Windows setup, real OS shortcut collisions, native drag/resize persistence, actual installed upgrades over an older version, and macOS/Linux interaction behavior remain unverified. Primary routing, reassignment and deeper Context Compression remain pending. Native interaction tests establish the Phase 2 slice on this Windows machine; they do not certify every OS or workload. The workflow emitted non-failing Node-action deprecation annotations; action-version maintenance is deferred to hardening rather than expanding this runtime fix.

## 2026-09-10 — B2 surface restyle checkpoint (working tree after de63f2e)

- NOT VERIFIED — Overall B2 restyle completion: awaiting resolution of the outward-glow boundary below. Earlier Phase 2 measurements and release results do not verify this changed working tree.
- PASS — Exact reference CSS values ported: `src/styles/capture.css:7` scopes all 11 reference tokens; `:25` defines the 175deg #181818 → #121212 gradient, 1px rim, 12px radius and four-shadow stack; `:35` defines the fading top hairline. Browser CSSOM comparison against the supplied HTML passed for all 11 tokens, background, border, radius, shadows and hairline, ignoring only comments/whitespace.
- PASS — Shared 18×18 close treatment: `src/styles/capture.css:43`, `src/components/QuickCapture.tsx:100`, `src/components/CaptureEditor.tsx:108`. Browser CSSOM comparison with the reference close rule passed.
- PASS — Opaque active cards: `src/components/CaptureEditor.tsx:97` no longer applies saved whole-surface opacity; `src/styles/capture.css:25` uses opaque gradient stops. Browser computed opacity was exactly 1 and backdrop-filter was none. The opacity slider is removed; stored opacity data is preserved. This is not a claim that native transparent-window support was disabled.
- PASS — Provisional default dimensions changed in code: Quick Capture 432×80 and editor 330×222 logical pixels at `src-tauri/src/capture_runtime.rs:74`; capture placement uses 432×80 at `:128`; new editor presentation defaults use 330×222 at `src-tauri/src/captures.rs:55`. Saved editor sizes still apply at `capture_runtime.rs:343`; resizability remains enabled at `:79`.
- PASS — Typography and ambient destination: Quick Capture body 11.5px, hint 8.5px, destination 8px, pip 3×3 with 5px glow (`src/styles/capture.css:54`); editor title 12px and body 11px (`:92`). Destination spans are noninteractive (`QuickCapture.tsx:99`, `CaptureEditor.tsx:113`). Current Quick Capture route is Waiting Room; future routing/name integration is not implemented here.
- PASS — Capture submission and editor dismissal in simulated IPC browser run: 1 commit contained exactly `B2 exact text\nsecond line  `; draft cleared; 0 input/select elements could prompt for metadata. Editor close sent `save_capture_edit` with content `B2 edit` and dismiss=true. Source handlers remain at `QuickCapture.tsx:64` and `CaptureEditor.tsx:17`. Native input/focus is not covered by this browser harness.
- PASS — `updated_at` remains semantic-only: `captures::tests::every_presentation_change_is_separate_and_never_bumps_semantic_time` passed after the default-size change. It writes size 620×410 along with other presentation changes and asserts equality of the entire original capture (`src-tauri/src/captures/tests.rs:71`). `Database::save_presentation` writes only presentation_state (`src-tauri/src/captures.rs:268`). No schema, capture writer or semantic update logic changed.
- PASS — Current local checks: `pnpm build`; `node scripts/check-ipc-naming.mjs` (23 files); `cargo +1.96.0 test --locked --manifest-path src-tauri/Cargo.toml --lib` (15 passed, 0 failed).
- FAIL — Full outward native glow under the existing edge-flush geometry: the exact shadow stack exists, but html/body/root have overflow:hidden (`src/styles/globals.css:30`) and active surfaces fill their bounds (`src/styles/capture.css:21`). Space outside a native webview cannot display its CSS shadows. Owner clarification is pending; native compositing flags remain unchanged (`capture_runtime.rs:77`).
- NOT VERIFIED — Native visual result, actual native dimensions and latency for this restyle; no native runtime session was run for these changes. Browser viewport checks requested 432×80 and 330×222; DOM offset sizes reported 432×81 and 330×223 in this browser environment, so those results are not reported as exact native size verification.
- NOT VERIFIED — Four-platform release builds for this restyle; the prior green run covers source 03819c4 only. No push, release dispatch or Phase 3 implementation was performed in this step.

## 2026-09-10 — gutter follow-up paused: Windows click-through gate blocked

This checkpoint supersedes the prior request for gutter authorization. Objective: transparent outer gutters around unchanged 432×80 / 330×222 opaque cards. Inspected context: the supplied HTML's exact B2 CSS, active-surface components, native window placement, presentation persistence, and Windows hit-testing documentation. Assumption tested: enlarging the existing transparent WebView windows could provide an input-safe gutter. That assumption failed the plain-window click test. No gutter completion is claimed.

- PASS — Accepted opacity-slider removal recorded as a separate product decision, with preserved stored opacity: `DECISIONS.md:55`; the pin handler passes `view?.opacity` through at `src/components/CaptureEditor.tsx:117`. Evidence is code inspection; no migration/reset was added.
- FAIL — Plain transparent gutter click-through: one real Sky Windows click at capture-relative (12,12) over dedicated Notepad left native capture focus true and moved activeTag from TEXTAREA to BODY. Read-only post-click evidence: `.reforge-evidence/gutter-trial/after-plain-gutter-click.json`, capture entry. A transparent corner consumed input.
- NOT VERIFIED — Native HTTRANSPARENT experiment as a reliable cross-application fix: attempts to click the underlying Notepad at physical (666,320) were refused twice by Sky because the point belonged to `msedgewebview2.exe "Chrome Legacy Window"`. The tool's permitted activation/refresh retry produced the same result. These were refused attempts, not delivered clicks. Trial source: `.reforge-evidence/gutter-trial/hit_test.rs`; no such subclass remains in production source.
- FAIL — Trial visible-card geometry/appearance: 96px CSS margins with a 624×272 logical outer capture window compressed the card and clipped its footer. Native measurement was 780×340 physical pixels / 1.25 scale; WebView viewport was 525×229 CSS pixels (`after-plain-gutter-click.json`). The owner's comparison screenshot independently shows the compressed trial. This does not verify the required visible 432×80 card or the 330×222 editor.
- NOT VERIFIED — Smallest gutter containing the full shadow: 96px per side was experimental only; no final gutter is selected. The native input gate stopped this approach before minimum-extent qualification.
- PASS — Trial rollback: SHA-256 of runtime source matched its pre-trial backup exactly (`D18BEC2D9CAD28F5802FED7EF93A4169822E4EB60FB6DED5F4B6D8E525F98D4E`); CSS matched its backup exactly (`EEEEB3DE54DFE01EFBD8E85A39747B67B09A79A95B9D4467D20C3C2DA0D16E44`). Only DECISIONS/STATUS changes from this follow-up remain in tracked source; earlier B2 edits are preserved. Trial artifacts are ignored local evidence.
- PASS — Presentation changes preserve `updated_at`: re-ran `captures::tests::every_presentation_change_is_separate_and_never_bumps_semantic_time` on restored source: 1 passed, 0 failed, 14 filtered out. The test writes 620×410 size and opacity 0.4, then compares the entire capture unchanged (`src-tauri/src/captures/tests.rs:71`). `Database::save_presentation` only writes presentation_state (`src-tauri/src/captures.rs:260`). Caveat: no final gutter persistence path exists to qualify.
- NOT VERIFIED — Final hotkey-to-ready latency range: two throwaway-build samples were 61.3050ms (`.reforge-evidence/gutter-trial/native.stderr.log`) and 79.6124ms (`hit-test.stderr.log`). Both are below 100ms, but two samples across failed experiments do not replace the 13-sample baseline of 41.6293–83.0763ms or qualify final gutter performance.
- NOT VERIFIED — Commit focus restoration and hiding after a final gutter implementation; no final implementation survived the input gate. Earlier Phase 2 results are not reused as proof.
- NOT VERIFIED — Final native appearance and both native visible-card measurements; the failed trial is not a passing visual check.
- NOT VERIFIED — Four-target release builds for this working tree. No push, release workflow dispatch or publishing was performed after the stop condition. The earlier green workflow verifies different source.

Self-review and unresolved risk: plain transparency consumes input; HTTRANSPARENT alone did not establish cross-process pass-through; WebView/Windows scaling must be reconciled before fixed card sizes can be claimed. The test app and Vite sessions were stopped. Phase 3 remains on hold. Resume only with an input-safe approach that can pass the required real Windows clicks; never ship the failed gutter or replace it with an opaque margin.

## 2026-09-10 — inward-light replacement paused for missing reference

- PASS — Owner decision recorded in `DECISIONS.md`, heading "owner drops gutters; inward-light replacement selected": gutters and further native hit-testing are dropped. The previous checkpoint's suggestion to resume gutter work is superseded.
- PASS — Gutter remains reverted by code inspection: `src/styles/capture.css:21` fills the window with height 100% and no gutter margin; `src-tauri/src/capture_runtime.rs:74` retains 432×80 / 330×222 default bounds, with no trial subclass.
- NOT VERIFIED — Exact inward-reference CSS: filename search in Downloads, `.codex/attachments`, and the repository found only the earlier `ht-surfaces-b2-final.html`, not `ht-surfaces-b2-inward.html`. No treatment values were approximated or implemented.
- PASS — Existing native transparency configuration identified by inspection only: `src-tauri/src/capture_runtime.rs:77` already specifies decorations(false), transparent(true), shadow(false). No window configuration changed. This does not establish how native corner pixels actually render.
- NOT VERIFIED — Native corner appearance, final inward-treatment appearance, and exact native visible-card measurements. These require Windows observation; no new native session was run at this checkpoint.
- NOT VERIFIED — Post-replacement focus restoration, capture hiding, latency range and four-target release builds. The replacement has not been implemented; historical results are not substituted.

Objective and scope: port the supplied inward CSS to the two active surfaces only. Inspected context: current surface CSS/native window creation, owner decision, and available reference filenames. No assumption was made about missing gradient/shadow values. Implementation in this step is documentation only. Self-review: gutter rollback remains intact, existing transparency is explicitly disclosed, and no native result is inferred from configuration. Blocking input: the replacement HTML file or its exact CSS.

## 2026-09-10 — inward material implementation / native qualification checkpoint

Objective: exact inward-light material on the two active surfaces, retaining native bounds, opaque content and semantic/presentation separation. The replacement HTML is now present and was read directly. Earlier missing-file/gutter checkpoints are historical, not the current plan.

- PASS — Exact reference treatment by automated declaration comparison: all 11 tokens, 5 material properties, and every declaration of both pseudo-elements match the supplied HTML (comments/whitespace ignored). `src/styles/capture.css:7`, `:27`, `:37`, `:44`; local runner `.reforge-evidence/verify-inward.mjs`, result `inward-css-verification.json`. The three card shadows and inner-ring shadow are inset; the small reference pip glow is contained inside the card.
- PASS — Opaque capture interior and no backdrop blur: read-only native computed style reports opacity `1`, opaque #181818/#121212 base gradient and backdrop-filter `none` (`.reforge-evidence/inward-capture-visible.json`). Card material uses the same shared class for the editor; editor native observation remains pending below.
- PASS — Capture native visible bounds: Windows inner size 540×100 physical pixels at scale 1.25 = 432×80 logical; Sky's native screenshot is 432×80. Native card renders the inward light and footer without the gutter trial's compressed body. Evidence: `inward-capture-visible.json` and the native Sky capture observation. CSS viewport is 364×68 with devicePixelRatio 1.4875000715255737; these CSS units are not mislabeled as native logical pixels.
- PASS — Capture corner transparency observed over white Notepad, with no opaque rectangular corner blocks in the native screenshot. Existing transparent(true), decorations(false), shadow(false) configuration at `src-tauri/src/capture_runtime.rs:77` is unchanged. No compositor/frame-rounding API was added. Windows 11 frame rounding as an independent causal mechanism is NOT VERIFIED.
- PASS — Real Enter commit restored the previous Notepad window: native log says `capture foreground restored: true`; Sky observation identifies Notepad's focused text editor. Native log `inward-native.stderr.log`, sequence 1. Commit IPC-to-persisted-and-hidden was 23.3817ms; Enter-to-ack was 41.2000ms.
- PASS — Capture hides and clears after commit: nativeVisible=false, nativeFocused=false and content="" in `.reforge-evidence/inward-after-commit.json`. The record was created in isolated `.reforge-evidence/native-b2-inward`, not the owner's database.
- FAIL — Readiness threshold: 13 real global-hotkey samples across 3 processes: 69.9856, 53.3270, 43.0723, 47.2779, 53.4325, 48.5184, 48.8164, 48.6279, 55.0617, 48.2668, 42.5592, 76.3151, 128.9790ms. Range 42.5592–128.9790ms; 1/13 exceeded 100ms. Baseline: 41.6293–83.0763ms across 13 samples. Source logs: `inward-native.stderr.log`, `inward-restart1.stderr.log`, `inward-restart2.stderr.log`; export `inward-latency.json`. The final failing sample's native focus event was 125.9234ms. This is a blocker, not an accepted measurement.
- PASS — Local checks: `pnpm build`; IPC naming (23 files); version synchronization; release invariants; `cargo +1.96.0 test --locked --manifest-path src-tauri/Cargo.toml --lib` (15 passed, 0 failed). The presentation test `every_presentation_change_is_separate_and_never_bumps_semantic_time` includes size and opacity and compares the whole capture unchanged (`src-tauri/src/captures/tests.rs:71`).
- PASS — Scope inspection: inward replacement changes only shared active-surface CSS; earlier B2 component/default-size edits remain presentation-only. `AmbientAnchor.tsx`, globals.css, record format, capture routing/semantic writer, native compositing flags and release workflow are unchanged. Accepted opacity removal remains a separate product decision. No Phase 3 work or gutter/hit-testing code is introduced.
- NOT VERIFIED — Native editor visual appearance and visible dimensions while open. Hidden native size is 413×278 physical at scale 1.25, corresponding to the requested 330×222 default rounded to integer physical pixels. The retrieval panel collapses between automated focus changes; owner assistance to leave the editor open was requested. Hidden bounds alone do not prove editor rendering.
- NOT VERIFIED — Four-target release workflow for this source; dispatch follows this checkpoint. No phase/task completion is claimed while the latency blocker or native editor/release gaps remain.

Self-review: exact CSS and data-preservation checks passed, and capture native behavior was observed. Remaining limits: the latency failure is retained; native editor observation and platform installer builds are still pending. Existing window transparency is disclosed rather than presented as a new change. No native focus or retrieval behavior was modified to make the tests pass.
