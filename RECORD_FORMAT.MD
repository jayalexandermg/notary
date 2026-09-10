# RECORD_FORMAT.md

**Version:** 1.0
**Status:** Locked
**Reconciliation:** Final v1 amendments from the locked HoverThought reforge execution prompt, 2026-09-10.
**Applies to:** HoverThought Capture, Swhype, project-state repo, and any future tool that reads or writes records.

---

## 0. What this is and why it exists

This document defines the **shape of a saved thing** across the entire ecosystem.

Code is disposable. Data is not. Any tool here can be rewritten at any time — but if each tool writes in its own shape, the accumulated pile becomes unreadable by whatever comes next, and the history is unrecoverable.

This spec fixes only the things that are **expensive or impossible to change retroactively**. Everything not specified here is deliberately left free.

**Rule for implementers:** if this document does not require something, do not invent a requirement. If this document requires something, do not omit it.

---

## 1. The two record types

There are exactly two. They are not interchangeable and must not be merged into one shape.

### Type A — `capture`

A timestamped fragment of what a human noticed, thought, or wanted to remember.

- Produced by: HoverThought Capture, Swhype, and future capture surfaces.
- Semantics: **a record anchored to a moment.** `id` and `created_at` permanently identify that moment; neither changes.
- `content` is the mutable representation of that moment. An incomplete or mistaken transcription may be corrected or completed in place; this does not create a new moment.
- A changed opinion or thought is a new capture. Captures are never superseded and carry no supersession trail.

### Type B — `project_state`

The current canonical truth about a project.

- Produced by: a human, deliberately, editing a file in the project repo.
- Semantics: **what is true right now.** Overwritten as reality changes, with a trail of what it used to say.

### The hard boundary

**Capture surfaces never produce `project_state` records.**

HoverThought and Swhype are capture-only. A note reading *"the objection randomizer isn't random"* is an observation (Type A). The decision *"the randomizer is now seeded per-session"* is a state change (Type B), authored separately by a human in the repo.

There is no promotion mechanic. There is no automatic conversion. A capture may *inform* a state change; it never *becomes* one.

---

## 2. Universal envelope

Every record of either type carries these fields. They are **auto-assigned by the writing system**. The user is never prompted for any of them.

| Field | Type | Rule |
|---|---|---|
| `id` | UUIDv7 | Assigned at creation. Never derived from content, title, or order. Never regenerated, including on edit. |
| `type` | string | `capture` or `project_state`. |
| `schema_version` | string | `1.0` for records written under this spec. |
| `created_at` | ISO 8601 **with timezone offset** | Set once at creation. Never changes. |
| `updated_at` | ISO 8601 with offset | Last persisted **semantic record mutation**: content, title, or container reassignment. See §5. |
| `source` | string | What produced it. Format: `<app>/<surface>` — e.g. `hoverthought/quick-capture`, `swhype/capture`, `repo/manual`. |

### Why each is unrecoverable later

- **`id`** — merge, dedupe, and provenance chains all depend on stable identity. Reconstructing IDs after the fact is impossible.
- **`created_at` with offset** — a timestamp without an offset cannot be ordered correctly across devices or timezones. Retrieval is fundamentally temporal; this cannot be inferred from file order.
- **`source`** — recall will eventually be weighted by origin. Cannot be backfilled.
- **`schema_version`** — this is what allows fields to be added later without orphaning everything written today. Without it, every future migration becomes guesswork about which era a record came from.

---

## 3. `capture` record

Envelope fields (§2), plus:

| Field | Required | Source | Rule |
|---|---|---|---|
| `content` | Yes | User | Plain text with the existing block grammar. Not JSON. |
| `container_id` | Yes | Auto | Exactly one. Never null, never multiple. See §4. |
| `title` | No | User/derived | Optional. Absence is normal for quick captures. |
| `derived_from` | No | Auto | At most one UUIDv7 of a source record. Never an array, delimited string, or multi-ID JSON. See §6. |

New Quick Capture records use `type: "capture"`, `schema_version: "1.0"`, and `source: "hoverthought/quick-capture"`. `content` is required plain text, never JSON. Absence of a title is normal.

### Reserved — do not implement in v1, do not repurpose these names

`tags`, `links`, `affects`, `confidence`

These are named here so no implementation claims them for a different meaning later.

### Explicitly NOT part of a capture

`pos_x`, `pos_y`, `width`, `height`, `is_open`, `is_minimized`, `opacity`, `always_on_top`, and any other window or view state.

See §7. This is the single most important structural rule in this document.

---

## 4. Containers

Every capture belongs to **exactly one** container.

- If a Primary Project is active → the capture routes there.
- If no Primary Project is active → the capture routes to **Waiting Room**.

Rules:

- `container_id` is never null and never a list.
- Routing at capture time is **fully automatic**. No selector, no dialog, no classification step may block or interrupt a capture.
- A selector may exist as an **optional, non-blocking** control. It must never be required to complete a capture.
- Reassignment after capture is allowed and expected.
- Waiting Room is a system container, not a user-created project.

**Cardinality is deliberately locked at one.** Expanding one → many later is trivial: existing records already have their single container, and the constraint is simply relaxed. Collapsing many → one is a lossy migration requiring a judgment call on every multi-filed record.

---

## 5. Mutability

### `capture`

- `content` and `title` may be edited, and `container_id` may be reassigned. A semantic change **overwrites in place**; `updated_at` bumps.
- No revision history in v1.
- `id` and `created_at` never change under any circumstance.
- Captures are never superseded and carry no supersession trail. A changed opinion is a **new capture**.
- Deletion is permitted.

### `project_state`

- Overwritten as truth changes.
- **Must** carry a supersession trail (§8).
- Prior versions are preserved by version control, not by in-file archiving. Never manually archive old content inside the file.

### `updated_at` discipline

`updated_at` is the time of the last persisted **semantic record mutation**. It must bump when `content`, `title`, or `container_id` changes. Saving unchanged values is not a semantic mutation.

It must **not** bump for: window movement, resize, open/close, minimize, pin toggle, opacity change, or any other presentation/window/view-state change. It must not bump when a schema migration rewrites storage without changing semantic record state.

Waiting Room → another container must bump `updated_at`. Moving a window must not. Additive migrations change storage representation, not semantic history; never mass-bump timestamps during migration.

Violating this makes every sync, export, and diff report phantom modifications, and makes activity analysis meaningless.

---

## 6. Provenance chains

When a record is generated from another record — a capture transformed into an execution prompt, a prompt producing a change summary — the new record carries:

```
derived_from: <uuidv7 of the source record>
```

Rules:

- `derived_from` is optional and holds **zero or one UUIDv7**. Multi-source provenance is not supported in v1.
- Derivation is **non-destructive**: the new record receives its own stable `id` and references the source's `id`.
- Creating a derived record never mutates, consumes, promotes, resolves, or archives the source merely because the derived record exists.
- This rule describes derivation, not global immutability. The source capture remains editable under §5.
- A chain may have multiple steps, each with its own stable identity and at most one source. HoverThought v1 does not implement a generalized provenance graph or produce `project_state` records.

### Accepted v1 limitation

Because captures are editable and v1 has no revision history, `source.updated_at > derived.created_at` detects **possible derivation staleness**. It proves some semantic mutation occurred after derivation, but not that content changed: title or container reassignment also bumps `updated_at`.

V1 cannot identify which semantic field changed or reconstruct the exact source state used during derivation. This limitation is accepted. Do not add revision history, event sourcing, `content_updated_at`, snapshots, or hashes solely to eliminate it.

---

## 7. Presentation state is separate

Window and view state must live in its own store, keyed by record `id`.

```
captures            presentation_state
--------            ------------------
id (PK)      ←───   record_id (FK)
type                pos_x, pos_y
schema_version      width, height
created_at          is_open, is_minimized
updated_at          opacity
source              always_on_top
content             device_id
container_id
```

**Why this is non-negotiable:**

1. Mixing them means moving a window mutates the thought record — corrupting `updated_at`, sync, and diffs.
2. `is_open`, position, and size are meaningless on any device other than the one that wrote them. Syncing them creates conflicts where nothing actually disagrees.
3. Splitting during a rebuild costs roughly an hour. Splitting after thousands of records exist is a data migration with real failure modes.

Pin and opacity remain fully available as features. They are **presentation**, not properties of the thought.

---

## 8. `project_state` record

Lives as a markdown file in the project repo, one file per project. Frontmatter carries the envelope:

```markdown
---
id: 01931f4a-...
type: project_state
schema_version: "1.0"
created_at: 2026-09-10T14:22:00-07:00
updated_at: 2026-09-10T14:22:00-07:00
source: repo/manual
project: scripto
---

# Scripto

## Current state
<what is true right now — spec, featureset, direction>

## Superseded
- 2026-09-10 — was X, now Y. Reason: Z.
  affects: scripto/call-review, scripto/objection-engine
```

### The `## Superseded` block

- Most recent 3–5 entries only. Older entries live in version control history.
- Each entry states: **what it was, what it is now, why it changed.**

### The `affects:` line

Lists downstream components a change touches. Written **at the moment of the change**, while the knowledge is free.

Two purposes:

1. A fresh session in any provider reads it and knows not to reason forward from a dead assumption — the specific cause of cross-provider staleness.
2. Each line is a labeled example of how a change propagated. Accumulated, these become the dependency graph, read off real history rather than designed from a guess.

`affects:` appears **only** on `project_state` records. Never on captures.

---

## 9. Forward compatibility

**Preserve unknown fields.** Any tool reading a record it did not write must preserve fields it does not recognize when writing that record back. Silently dropping unrecognized fields destroys data written by other tools in the ecosystem.

**Additive migrations only.** New fields are added; existing fields are not removed or repurposed. Matches the existing `ALTER TABLE` strategy.

**Version on change.** Any change to this document that alters field meaning increments `schema_version`. Records keep the version they were written under.

**Never reuse a field name for a new meaning.** Add a new field instead.

### Legacy data

Existing legacy rows remain non-destructively preserved and readable where practical. They do not require UUIDv7 regeneration, envelope backfilling, or presentation extraction. Every record written through the new Capture path must conform to this v1 contract. Legacy preservation must not distort the new model.

---

## 10. Implementation checklist

For any tool adopting this spec:

- [ ] UUIDv7 generated at creation, never regenerated
- [ ] `created_at` includes timezone offset
- [ ] `schema_version` written on every record
- [ ] `source` identifies app and surface
- [ ] Exactly one `container_id`, never null
- [ ] No metadata prompt blocks a capture
- [ ] Presentation state in a separate store
- [ ] `updated_at` bumps on content, title, and container reassignment
- [ ] Presentation changes and storage-only migrations do not bump `updated_at`
- [ ] Unknown fields preserved on read/write
- [ ] `derived_from` supports zero or one UUIDv7 with non-destructive derivation
