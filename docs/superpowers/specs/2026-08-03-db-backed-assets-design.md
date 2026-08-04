# DB-backed assets with disk mirroring — design

## Context

Assets are currently **disk-only**. `POST /api/docs/[id]/assets` writes bytes to
`${filesRoot}/.assets/<docId>/`, and `src/lib/quota.ts` computes usage by globbing
that directory. Nothing about an asset exists in Postgres.

The disk mirror deliberately ignores them. `relPathIfManaged()` in
`src/lib/disk/reverse-sync.ts` rejects any path with an `.assets` segment, and
`src/lib/disk/watcher.ts` ignores `/\.assets/`.

Two consequences follow:

1. **The database is not the source of truth for assets.** A restore from a
   Postgres backup returns documents without their images. `pgbackweb` backs up
   the database; the asset bytes are only in the container volume.
2. **A `.md` is not portable.** Copy `Parchment Guide/Welcome.md` somewhere else
   and its images do not travel, because they live in a sibling `.assets` tree
   keyed by document ID, not next to the file.

The second point matters more than it looks. The disk mirror is the product's
differentiator — "every document is a real markdown file on disk". An `.md` whose
images resolve only inside this installation is a weaker promise than intended.

## What this change does

**Postgres becomes the source of truth for asset bytes, and the disk mirror
writes each asset next to the `.md` that references it.**

That is deliberately *both* halves, not a choice between them:

- **DB** so assets survive a database restore, participate in existing backups,
  and stop depending on volume state.
- **Alongside the `.md`** so a copied folder is genuinely self-contained, which is
  the whole point of the mirror.

## Decisions

**D1 — Bytes live in Postgres, in a dedicated table.**

```
assets(
  id            uuid primary key,
  doc_id        uuid not null references documents(id) on delete cascade,
  filename      text not null,
  mime          text not null,
  byte_size     integer not null,
  sha256        text not null,
  bytes         bytea not null,
  created_at    timestamptz not null default now(),
  unique (doc_id, filename)
)
```

`bytea` rather than large objects: simpler, transactional, and these are document
images, not video. `sha256` enables dedupe and lets the mirror skip rewriting a
file whose content has not changed.

**Rejected:** metadata-in-DB with bytes-on-disk. It leaves the restore gap open,
which is half the reason for the change.

**D2 — On disk, assets sit in a folder beside the document.**

For `Parchment Guide/Welcome.md`, assets go to `Parchment Guide/Welcome.assets/`.
The markdown reference becomes relative: `![alt](Welcome.assets/diagram.png)`.

Chosen over a flat sibling because a folder per document keeps directories legible
when several documents share one folder, and it survives a document rename by
being renamed with it.

**D3 — The database writes to disk, never the reverse (initially).**

Asset sync is **one-directional**. The mirror writes what the DB holds. An asset
file dropped into `Welcome.assets/` by hand is *not* imported.

This is the important safety decision. Documents already carry four shadow copies
— `documents.content`, `collab_state`, browser IndexedDB, and the disk `.md` — and
reconciling them is what made the release-notes bug survive three fixes. Assets get
**two** shadows, and only one of them writes. Bidirectional asset sync can be added
later behind its own spec; it is explicitly out of scope here.

**D4 — `relPathIfManaged()` stays as-is.**

It keeps rejecting `.assets`, and it must also reject the new `*.assets/`
directories, so reverse-sync never treats an image as an edited document. The
change is to the *forward* path only.

**D5 — Rename and move follow the document.**

Renaming `Welcome.md` renames `Welcome.assets/`. Moving it moves the folder. Both
are already single operations in the mirror; the asset folder is handled in the
same transaction so the two cannot diverge.

**D6 — Quota reads from the DB.**

`src/lib/quota.ts` currently globs `.assets`. It switches to `sum(byte_size)`
grouped by `doc_id`, which is both cheaper and correct after a restore.

## Migration

Trivial in practice. Production currently holds **one asset file, 12 KB total**.

1. Read every file under `${filesRoot}/.assets/<docId>/`.
2. Insert into `assets` with computed `sha256`.
3. Write it to `<docPath>.assets/` beside the document.
4. Rewrite the markdown reference from the old form to the relative one.
5. Leave the old `.assets` tree in place. **Do not delete it in the same release** —
   it is the rollback path. A later release removes it once the new path is proven.

## Out of scope

- Importing asset files added to disk by hand (D3).
- Deduplicating identical bytes across documents; `sha256` is stored to make that
  possible later, but nothing acts on it yet.
- Any change to the upload UI, the crop flow, or alt-text handling.
- Deleting the legacy `.assets` tree.

## Testing

- **Unit:** `relPathIfManaged()` rejects `Welcome.assets/x.png`; markdown reference
  rewriting; sha256 dedupe skip.
- **Integration (Testcontainers):** upload writes DB row + disk file; rename moves
  the folder; delete cascades; quota sums from the DB.
- **Restore test — the one that proves the point:** dump the database, wipe the
  files volume, restore, and confirm the images come back and the `.md` renders.
- **Live verify:** upload an image, confirm it renders, confirm the file exists
  beside the `.md` in the container, copy the folder out and confirm the markdown
  still resolves its image.

## Risk

The mirror is the subsystem with this project's worst bug history. The mitigation
is D3: one-directional sync, so there is no reconciliation to get wrong. If that
constraint is relaxed later, it needs its own spec and its own live verification.
