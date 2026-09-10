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
