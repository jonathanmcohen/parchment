// v0.2.15: one-shot migration of pre-v0.2.12 disk-only assets into the database.
//
//   docker exec parchment tsx /app/scripts/import-legacy-assets.ts          # dry run
//   docker exec parchment tsx /app/scripts/import-legacy-assets.ts --apply  # write
//
// Dry run is the DEFAULT and writes nothing. Pass --apply to commit.
//
// Safe to re-run: an asset that already has a row is skipped, so a second run is
// a no-op and an interrupted run can simply be repeated.
//
// After a successful --apply, the assets still sit in the legacy `.assets/` tree.
// That is deliberate - it is the rollback path. Each document's next save writes
// the new `<DocName>.assets/` copy beside its .md, and the legacy tree can be
// removed once those are confirmed present.

import { importLegacyAssets } from '@/lib/uploads/legacy-import'

function filesRoot(): string {
  return process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const root = filesRoot()

  console.log(`[import-legacy-assets] files root: ${root}`)
  console.log(`[import-legacy-assets] mode: ${apply ? 'APPLY (writing)' : 'dry run'}`)

  const res = await importLegacyAssets({ root, dryRun: !apply })

  console.log('')
  console.log(`  found on disk      ${res.found}`)
  console.log(
    `  ${apply ? 'imported' : 'would import'}${apply ? '           ' : '       '}${res.imported}`,
  )
  console.log(`  already in the db  ${res.skippedExisting}`)
  console.log(`  orphaned (no doc)  ${res.skippedOrphan}`)
  console.log(`  failed             ${res.failed}`)
  console.log('')

  if (!apply && res.imported > 0) {
    console.log('Re-run with --apply to write these rows.')
  }
  if (res.failed > 0) {
    console.error('[import-legacy-assets] some assets failed; re-run to retry them')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[import-legacy-assets] fatal:', err)
  process.exit(1)
})
