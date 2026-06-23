#!/usr/bin/env node
// Lightweight structural YAML check for the GH Actions workflows (no yaml dep,
// no actionlint available in this env). It is NOT a full YAML parser — it
// catches the mistakes that actually break Actions: tab indentation, odd
// indentation steps, unbalanced quotes/brackets, missing required top-level
// keys, and obviously malformed `uses:` action refs. CI runs actionlint-grade
// validation implicitly by executing the workflows; this is the local gate.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const files = [
  resolve(here, '..', '.github/workflows/ci.yml'),
  resolve(here, '..', '.github/workflows/release.yml'),
]

let failures = 0
const fail = (file, line, msg) => {
  failures += 1
  console.error(`  ${file}:${line}: ${msg}`)
}

for (const file of files) {
  const short = file.split('/').slice(-2).join('/')
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch (err) {
    fail(short, 0, `cannot read: ${err.message}`)
    continue
  }
  const lines = content.split('\n')

  // Required top-level keys (column-0, `key:`).
  const topKeys = new Set()
  lines.forEach((raw, i) => {
    const n = i + 1
    // Strip trailing comments outside quotes for the structural checks below.
    const codePart = raw.replace(/\s+#.*$/, '')
    if (raw.includes('\t')) fail(short, n, 'tab character in indentation (YAML forbids tabs)')
    if (/^[A-Za-z_][\w-]*:/.test(raw)) topKeys.add(raw.split(':')[0])

    // Balanced quotes (ignore lines that are pure comments).
    if (!raw.trimStart().startsWith('#')) {
      const singles = (codePart.match(/'/g) ?? []).length
      const doubles = (codePart.match(/"/g) ?? []).length
      if (singles % 2 !== 0) fail(short, n, "unbalanced single quote (')")
      if (doubles % 2 !== 0) fail(short, n, 'unbalanced double quote (")')
    }

    // Indentation must be a multiple of 2 spaces (the convention used here).
    const indent = raw.match(/^ */)?.[0].length ?? 0
    if (raw.trim() !== '' && indent % 2 !== 0 && !raw.trimStart().startsWith('#')) {
      fail(short, n, `odd indentation (${indent} spaces)`)
    }

    // `uses:` lines must reference owner/repo@ref or ./local/path.
    const usesMatch = codePart.match(/^\s*-?\s*uses:\s*(\S+)/)
    if (usesMatch) {
      const ref = usesMatch[1]
      const ok = ref.startsWith('./') || /^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[\w./-]+$/.test(ref)
      if (!ok) fail(short, n, `malformed action ref in uses: "${ref}"`)
    }
  })

  for (const key of ['name', 'on', 'jobs']) {
    if (!topKeys.has(key)) fail(short, 0, `missing required top-level key "${key}:"`)
  }

  // Bracket/brace balance across the whole file (flow collections).
  const balance = (open, close, label) => {
    let depth = 0
    for (const ch of content) {
      if (ch === open) depth += 1
      else if (ch === close) depth -= 1
      if (depth < 0) break
    }
    if (depth !== 0) fail(short, 0, `unbalanced ${label}`)
  }
  balance('{', '}', 'braces { }')
  balance('[', ']', 'brackets [ ]')

  // Content invariants the release process depends on (cheap regression guards).
  if (short.endsWith('ci.yml')) {
    for (const needle of ['e2e-a11y:', 'verify-carry-forward-closed', 'workflow_call:']) {
      if (!content.includes(needle)) fail(short, 0, `ci.yml missing expected "${needle}"`)
    }
  }
  if (short.endsWith('release.yml')) {
    if (!content.includes('platforms: linux/amd64,linux/arm64')) {
      fail(short, 0, 'release.yml missing multi-arch platforms line')
    }
    if (!/packages:\s*write/.test(content)) {
      fail(short, 0, 'release.yml missing "packages: write" permission')
    }
    // Keep-branch rule: the pipeline must never delete a release branch.
    if (/push\s+--delete|git\s+branch\s+-[dD]|delete.*release\//.test(content)) {
      fail(short, 0, 'release.yml appears to delete a branch (violates keep-branch rule)')
    }
  }

  if (failures === 0) console.log(`  ${short}: OK`)
}

if (failures > 0) {
  console.error(`\ncheck-workflows: FAIL — ${failures} issue(s).`)
  process.exit(1)
}
console.log('\ncheck-workflows: PASS — workflow YAML is structurally well-formed.')
