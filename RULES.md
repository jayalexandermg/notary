# Product and engineering rules

- [RECORD_FORMAT.MD](RECORD_FORMAT.MD) is the single persisted-data contract, reconciled with the locked execution prompt's final v1 amendments.
- Capture first, organize later. Keyboard capture and anchor retrieval are separate surfaces.
- One capture has exactly one container. Primary is routing state; Waiting Room is a system container.
- Presentation changes never mutate semantic timestamps. New capture IDs are stable UUIDv7.
- No destructive legacy migration. No new legacy Combine, no multi-source provenance, no above-seam integrations.
- Depth increases information within a bounded footprint. Compressed context stays navigable.
- Keep Tauri v2, Rust, React, Vite and rusqlite. Preserve Windows/Linux and both macOS release targets.
- Keep `notary.db`, `com.hoverthought.hud`, the WiX upgradeCode, snake_case IPC, version checks, and block-parser trailing-space rules.
- Pre-warmed Quick Capture must be measured from the native hotkey event to visibly focused input. A successful build is not Windows runtime evidence.
- Work sequentially: prove the Waiting Room vertical slice, then Primary routing, then deeper spatial navigation, then hardening.
- The Release workflow is load-bearing. Preserve its installer builds and Release attachments, repair affected references in the same change, record intentional revisions in DECISIONS, and require an actual green release workflow before Phase 2 completion.
