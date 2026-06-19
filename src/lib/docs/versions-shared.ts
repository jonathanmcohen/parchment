// D3 version history — db-free shared module (safe to import from client components).
// The repo (`versions-repo.ts`) imports `@/db` (pg), so client code must import
// types from HERE, not from the repo.

/** Lightweight version summary as returned by GET /api/docs/[id]/versions */
export interface VersionSummary {
  id: string
  label: string | null
  kind: string
  createdAt: string
}

/** Full version with content + markdown (returned by GET /api/docs/[id]/versions/[versionId]) */
export interface Version extends VersionSummary {
  content: unknown
  markdown: string
}
