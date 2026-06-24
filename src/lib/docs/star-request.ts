// C4: build the request descriptor for the title-bar Star toggle.
//
// The doc title bar's Star icon persists via the EXISTING star endpoint
// `POST /api/docs/:id/star` (backed by `setStarred`), which writes ONLY the
// `starred` flag — the SAME endpoint FileManager's row-action star uses
// (~FileManager.tsx:879). This is a pure REUSE: no new backend, no migration.
//
// Keeping the request shape in a pure helper lets the unit gate prove, without a
// network call, that the star toggle targets `/star` with `{ starred }` and is
// never a local-only toggle that silently loses state on reload (the C4 crux
// invariant). Mirrors buildRenameRequest (S3-1).

export type StarRequest = {
  url: string
  method: 'POST'
  body: { starred: boolean }
}

export function buildStarRequest(docId: string, nextStarred: boolean): StarRequest {
  return {
    url: `/api/docs/${docId}/star`,
    method: 'POST',
    body: { starred: !!nextStarred },
  }
}
