import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { requireAdmin } from '@/lib/auth/guard'

/**
 * Migrations info page (I5-T1).
 *
 * Lists migration files from src/db/migrations/*.sql detected at build time
 * via fs.readdirSync. Informational only — no "run migration" button.
 * All migrations run automatically on startup via migrate.sh.
 *
 * Note: the migrations directory must be present in the standalone Next.js
 * output (it is — the Dockerfile copies the full src/ tree to the runner stage).
 */

function getMigrationFiles(): string[] {
  try {
    // At runtime in standalone output, resolve relative to the app root.
    const candidates = [
      join(process.cwd(), 'src/db/migrations'),
      join(process.cwd(), '.next/server/src/db/migrations'),
      // Fallback for dev
      join(__dirname, '../../../../../db/migrations'),
    ]
    for (const dir of candidates) {
      try {
        const files = readdirSync(dir)
          .filter((f) => f.endsWith('.sql'))
          .sort()
        if (files.length > 0) return files
      } catch {
        // Try next candidate
      }
    }
    return []
  } catch {
    return []
  }
}

export default async function MigrationsPage() {
  await requireAdmin()
  const migrations = getMigrationFiles()

  return (
    <section className="max-w-2xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Migrations</h1>
      <p className="mt-2 text-[var(--muted)]">
        All database migrations run automatically on startup via{' '}
        <code className="rounded bg-[var(--surface)] px-1 text-sm">migrate.sh</code>. No manual
        action required.
      </p>

      <p className="mt-4 text-[var(--muted)] text-sm">
        {migrations.length} migration file{migrations.length !== 1 ? 's' : ''} found.
      </p>

      {migrations.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1">
          {migrations.map((name) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <code>{name}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[var(--muted)] text-sm">
          Migration files could not be read in this environment.
        </p>
      )}
    </section>
  )
}
