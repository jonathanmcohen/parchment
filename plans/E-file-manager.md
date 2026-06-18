# Plan E — File manager (TIER 4)

Drive-style. Built after editor core + collab. Lives under `(app)/files`.

- **E1** Folders + nested folders, drag-drop reparent. *FM:* can't drop a folder into its own descendant.
- **E2** Standard views: Recents / Starred / Shared-with-me (stub) / Trash.
- **E3** Smart folders: saved searches that update live (e.g. "modified <7d AND tag #spec").
- **E4** Tags: color-coded, picker, file-list filter, bulk tag.
- **E5** Sort + view toggle: name/modified/created/size; grid/list/details with preview thumbnail.
- **E6** Bulk select: shift-click range, ⌘-click multi, drag-select region; bulk move/tag/delete/export.
- **E7** Right-click context menu: Rename, Move to…, Duplicate, Save as template, Star, Share, Export as…, Open in new tab, Show in folder, Trash.
- **E8** Breadcrumbs: click-to-jump + drag-drop reparent on breadcrumb hover.
- **E9** Search: Postgres `tsvector` FTS + pgvector semantic; filter tag/folder/author/modified-range; ⌘K palette with hybrid-mode toggle.
- **E10** ⌘P fuzzy file finder.
- **E11** Trash retention: configurable window; "Empty trash now" gated by **typed confirmation**. *FM:* gate text must match exactly or action refused.
