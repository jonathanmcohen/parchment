// J9-0: pure CLI arg-parser tests. No network, no fs — only the parser that maps
// argv → a typed command descriptor. The HTTP client is exercised separately with
// a stubbed fetch (cli-client.test.ts).

import { describe, expect, it } from 'vitest'
import { formatHelp, parseCliArgs } from '@/../cli/args'

describe('parseCliArgs', () => {
  it('parses `docs list` into a known command', () => {
    const r = parseCliArgs(['docs', 'list'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.command).toBe('docs:list')
  })

  it('parses `search <query>` capturing the positional', () => {
    const r = parseCliArgs(['search', 'hello world'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.command).toBe('search')
    expect(r.positionals).toEqual(['hello world'])
  })

  it('parses `backup export out.zip`', () => {
    const r = parseCliArgs(['backup', 'export', 'out.zip'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.command).toBe('backup:export')
    expect(r.positionals).toEqual(['out.zip'])
  })

  it('parses `backup restore in.zip`', () => {
    const r = parseCliArgs(['backup', 'restore', 'in.zip'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.command).toBe('backup:restore')
  })

  it('parses `docs import file.md`', () => {
    const r = parseCliArgs(['docs', 'import', 'file.md'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.command).toBe('docs:import')
    expect(r.positionals).toEqual(['file.md'])
  })

  it('collects global --url and --token flags', () => {
    const r = parseCliArgs(['--url', 'http://h:3000', '--token', 'pat_abc', 'docs', 'list'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.command).toBe('docs:list')
    expect(r.flags.url).toBe('http://h:3000')
    expect(r.flags.token).toBe('pat_abc')
  })

  it('supports --flag=value form', () => {
    const r = parseCliArgs(['docs', 'list', '--url=http://x:3000'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.flags.url).toBe('http://x:3000')
  })

  it('captures boolean flags (e.g. --dry-run, --json)', () => {
    const r = parseCliArgs(['backup', 'restore', 'in.zip', '--dry-run', '--json'])
    expect(r.kind).toBe('command')
    if (r.kind !== 'command') return
    expect(r.flags['dry-run']).toBe(true)
    expect(r.flags.json).toBe(true)
  })

  it('treats --help (anywhere) as a help request', () => {
    expect(parseCliArgs(['--help']).kind).toBe('help')
    expect(parseCliArgs(['docs', '--help']).kind).toBe('help')
    expect(parseCliArgs(['-h']).kind).toBe('help')
  })

  it('treats --version as a version request', () => {
    expect(parseCliArgs(['--version']).kind).toBe('version')
    expect(parseCliArgs(['-v']).kind).toBe('version')
  })

  it('no args → help', () => {
    expect(parseCliArgs([]).kind).toBe('help')
  })

  it('unknown command → error with a message', () => {
    const r = parseCliArgs(['frobnicate'])
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/unknown/i)
  })

  it('unknown subcommand → error', () => {
    const r = parseCliArgs(['docs', 'explode'])
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/unknown|usage/i)
  })

  it('a command that needs a positional but lacks one → error', () => {
    const r = parseCliArgs(['search'])
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/requires|missing|usage/i)
  })
})

describe('formatHelp', () => {
  it('returns a non-empty help string listing the commands', () => {
    const help = formatHelp()
    expect(help).toContain('parchment')
    expect(help).toContain('docs list')
    expect(help).toContain('backup export')
    expect(help).toContain('search')
  })
})
