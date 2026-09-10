# Reforge status

Objective: implement and measure the locked HoverThought Windows vertical slice on `reforge/hoverthought-capture`.

Inspected: v0.1.9 history, legacy SQLite schema/UUIDv4 generator, hotkeys, cold note-window path, startup restoration, BlockEditor coupling, palette, shared settings/events, IPC/version checks and four-target packaging.

Completed in source: preserved earlier user edits, selected the verified baseline, reconciled RECORD_FORMAT.MD with the final amendments, added capture/presentation storage and seven focused Rust tests, connected three reusable surfaces, replaced the legacy creation/startup path, added configurable shortcut registration and readiness/commit instrumentation.

In progress: Phase 2 — Windows verification of Waiting Room Quick Capture, retrieval, edit and save/dismiss. The phase is **not complete**. Primary Project, reassignment UI, deeper Context Compression and outward capture dragging have not been implemented; the locked execution order requires proving this slice first.

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
| Native Windows build | PASS | `cargo +1.96.0 build` produced the Windows executable |
| Release continuity checks | PASS, local | `node scripts/check-release-invariants.mjs`: identifier, WiX upgradeCode and installer targets preserved |
| Release workflow | NOT RUN on reforge yet | Four-target manual dispatch prepared; Phase 2 remains open until the actual workflow succeeds |
| Windows runtime / performance | PARTIAL, blocked | Native app launches with a 24×48 anchor. Computer Use stopped before shortcut input because it could not identify the unrelated browser URL confidently; no native capture-loop or latency pass is claimed |

The browser harness is `.reforge-evidence/frontend.html`. It uses the real React components with a simulated IPC backend and does not test SQLite, OS accelerators, native window bounds or foreground restoration. Its browser viewport is constrained for UI tests; it is not a fullscreen desktop product surface.

## Build environment

Rust stable 1.98.1 installed, but Smart App Control blocked `rustc.exe`. Official Rust 1.96.0 was permitted to run with the existing policy intact. Its build then failed because Smart App Control blocked a newly generated dependency helper. Code Integrity event 3077 names `VerifiedAndReputableDesktop` and policy GUID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. No Windows security settings were changed by this task.

The owner subsequently reported switching Smart App Control off. Native compilation and all 15 Rust tests then succeeded. Windows runtime verification is in progress against an isolated debug database.

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

Next: verify the native app against an isolated debug database using `HOVERTHOUGHT_TEST_DATA_DIR`, measure the real accelerator/focus/commit loop, and require a successful four-target Release workflow run. Proceed to Primary routing and deeper navigation only after the first slice passes.

Self-review: fixed a potential native event-loop deadlock by dropping runtime state locks before dispatching native window work. The commit path confirms native visibility after hiding before acknowledging success. Browser tests exposed and verified a fix for preview activation when a context layer is replaced underneath a stationary pointer.

Assumptions: one reusable editing window and a plain-text editor with native undo are sufficient for the first slice; rich block editing remains deferred. The screenshots specify interaction and footprint only. Legacy notes are exposed read-only and new legacy Combine/creation IPC is not registered.

Unresolved risks: Native focus/show/hide timing, shortcut collisions, restart survival, DPI/monitor placement, editor presentation persistence and cross-platform builds remain unverified. Browser results are not a substitute for any of those checks.
