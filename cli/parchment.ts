#!/usr/bin/env -S npx tsx
// J9: `parchment` CLI entry. Interprets the parsed argv descriptor and drives the
// PAT-authenticated REST client. Run via `pnpm cli <command>` or, once linked,
// `parchment <command>`. NO db imports — this is a pure HTTP client so it works
// against a remote instance without local DB access.
//
// Auth: a Personal Access Token (pat_…) via --token or env PARCHMENT_TOKEN.
// Base URL via --url or env PARCHMENT_URL (default http://localhost:3000).
// J8 scopes apply server-side: read commands need docs:read; import/restore need
// docs:write (a docs:read token's 403 surfaces as a non-zero exit + message).

import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { type CliFlags, formatHelp, parseCliArgs } from './args'
import { ParchmentClient } from './client'

// Kept in sync with package.json#version (read lazily to avoid a JSON import assert).
const CLI_VERSION = '0.2.0'

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function resolveBaseUrl(flags: CliFlags): string {
  return flags.url ?? process.env.PARCHMENT_URL ?? 'http://localhost:3000'
}

function resolveToken(flags: CliFlags): string {
  const token = flags.token ?? process.env.PARCHMENT_TOKEN
  if (!token) {
    fail('No token. Pass --token pat_… or set PARCHMENT_TOKEN. Create one in Settings → Developer.')
  }
  return token
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2))

  if (parsed.kind === 'help') {
    process.stdout.write(`${formatHelp()}\n`)
    return
  }
  if (parsed.kind === 'version') {
    process.stdout.write(`${CLI_VERSION}\n`)
    return
  }
  if (parsed.kind === 'error') {
    fail(parsed.message)
  }

  const { command, positionals, flags } = parsed
  const client = new ParchmentClient(resolveBaseUrl(flags), resolveToken(flags))
  const asJson = flags.json === true

  switch (command) {
    case 'docs:list': {
      const docs = await client.listDocs()
      if (asJson) {
        process.stdout.write(`${JSON.stringify(docs, null, 2)}\n`)
      } else if (docs.length === 0) {
        process.stdout.write('No documents.\n')
      } else {
        for (const d of docs) process.stdout.write(`${d.id}\t${d.title}\n`)
      }
      return
    }

    case 'search': {
      const query = positionals[0] ?? ''
      const result = await client.search(query)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return
    }

    case 'docs:import': {
      const file = positionals[0] ?? ''
      const bytes = new Uint8Array(await readFile(file))
      if (flags['dry-run']) {
        process.stdout.write(`[dry-run] would import ${file} (${bytes.length} bytes)\n`)
        return
      }
      const res = await client.importDoc(basename(file), bytes)
      if (res.warnings.length > 0) {
        for (const w of res.warnings) process.stderr.write(`warning: ${w}\n`)
      }
      process.stdout.write(asJson ? `${JSON.stringify(res)}\n` : `Imported as ${res.id}\n`)
      return
    }

    case 'backup:export': {
      const out = positionals[0] ?? ''
      if (flags['dry-run']) {
        process.stdout.write(`[dry-run] would export the workspace backup to ${out}\n`)
        return
      }
      const bytes = await client.exportBackup()
      await writeFile(out, bytes)
      process.stdout.write(`Wrote ${out} (${bytes.length} bytes)\n`)
      return
    }

    case 'backup:restore': {
      const file = positionals[0] ?? ''
      const bytes = new Uint8Array(await readFile(file))
      if (flags['dry-run']) {
        process.stdout.write(`[dry-run] would restore ${file} (${bytes.length} bytes)\n`)
        return
      }
      const res = await client.restoreBackup(bytes)
      process.stdout.write(asJson ? `${JSON.stringify(res)}\n` : 'Restore complete.\n')
      return
    }

    case 'whoami': {
      // No dedicated endpoint — a successful docs:read call proves the token works.
      await client.listDocs()
      process.stdout.write('Token is valid (docs:read confirmed).\n')
      return
    }

    default: {
      // Exhaustiveness — parseCliArgs already rejects unknown commands.
      fail(`unhandled command: ${String(command)}`)
    }
  }
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err))
})
