// J9-0: pure argument parser for the `parchment` CLI. NO fs, NO network, NO process
// side-effects — argv in, a typed descriptor out. The runnable entry (parchment.ts)
// interprets the descriptor; this module is what the unit tests exercise.
//
// Supported commands (each maps to a REST call carrying a PAT — J8 scopes apply):
//   docs list                 GET  /api/docs            (docs:read)
//   docs import <file>        POST /api/docs/import     (docs:write)
//   search <query>            GET  /api/search          (docs:read)
//   backup export <out.zip>   GET  /api/backup/export   (docs:read)
//   backup restore <in.zip>   POST /api/backup/restore  (docs:write)
//   whoami                    GET  /api/docs?... (auth probe; docs:read)
//
// Global flags: --url <base>, --token <pat>, --json, --dry-run. Env fallbacks
// (PARCHMENT_URL / PARCHMENT_TOKEN) are applied by the entry, not here.

export type CliCommand =
  | 'docs:list'
  | 'docs:import'
  | 'search'
  | 'backup:export'
  | 'backup:restore'
  | 'whoami'

export type CliFlags = {
  url?: string
  token?: string
  json?: boolean
  'dry-run'?: boolean
}

export type ParsedArgs =
  | { kind: 'command'; command: CliCommand; positionals: string[]; flags: CliFlags }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string }

// Per-command spec: the argv shape that selects it + how many positionals it needs.
interface CommandSpec {
  command: CliCommand
  // argv tokens (after flags are removed) that select this command.
  match: string[]
  // exact count of trailing positionals required after `match`.
  positionals: number
  usage: string
}

const COMMANDS: CommandSpec[] = [
  { command: 'docs:list', match: ['docs', 'list'], positionals: 0, usage: 'docs list' },
  {
    command: 'docs:import',
    match: ['docs', 'import'],
    positionals: 1,
    usage: 'docs import <file.md|file.docx>',
  },
  { command: 'search', match: ['search'], positionals: 1, usage: 'search <query>' },
  {
    command: 'backup:export',
    match: ['backup', 'export'],
    positionals: 1,
    usage: 'backup export <out.zip>',
  },
  {
    command: 'backup:restore',
    match: ['backup', 'restore'],
    positionals: 1,
    usage: 'backup restore <in.zip>',
  },
  { command: 'whoami', match: ['whoami'], positionals: 0, usage: 'whoami' },
]

// Flags that take a string value (everything else is boolean).
const VALUE_FLAGS = new Set(['url', 'token'])
const BOOL_FLAGS = new Set(['json', 'dry-run'])
const HELP_FLAGS = new Set(['--help', '-h'])
const VERSION_FLAGS = new Set(['--version', '-v'])

/** Split argv into positional tokens + a flag bag. Unknown value-flags error later. */
function splitArgv(argv: string[]): {
  positionals: string[]
  flags: CliFlags
  unknownFlag?: string
} {
  const positionals: string[] = []
  const flags: CliFlags = {}
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok === undefined) continue
    if (!tok.startsWith('--')) {
      positionals.push(tok)
      continue
    }
    // --flag or --flag=value
    const eq = tok.indexOf('=')
    const name = (eq === -1 ? tok.slice(2) : tok.slice(2, eq)).trim()
    if (VALUE_FLAGS.has(name)) {
      let value: string | undefined
      if (eq !== -1) {
        value = tok.slice(eq + 1)
      } else {
        value = argv[i + 1]
        i++ // consume the value token
      }
      if (name === 'url') flags.url = value ?? ''
      else if (name === 'token') flags.token = value ?? ''
    } else if (BOOL_FLAGS.has(name)) {
      if (name === 'json') flags.json = true
      else if (name === 'dry-run') flags['dry-run'] = true
    } else {
      return { positionals, flags, unknownFlag: name }
    }
  }
  return { positionals, flags }
}

/** Parse argv (already sliced past `node script`) into a typed descriptor. */
export function parseCliArgs(argv: string[]): ParsedArgs {
  // Help / version short-circuit anywhere in argv.
  if (argv.some((a) => HELP_FLAGS.has(a))) return { kind: 'help' }
  if (argv.some((a) => VERSION_FLAGS.has(a))) return { kind: 'version' }
  if (argv.length === 0) return { kind: 'help' }

  const { positionals, flags, unknownFlag } = splitArgv(argv)
  if (unknownFlag) return { kind: 'error', message: `unknown flag: --${unknownFlag}` }
  if (positionals.length === 0) return { kind: 'help' }

  // Resolve the command by longest matching prefix of positionals.
  let spec: CommandSpec | undefined
  for (const c of [...COMMANDS].sort((a, b) => b.match.length - a.match.length)) {
    if (c.match.every((m, idx) => positionals[idx] === m)) {
      spec = c
      break
    }
  }

  if (!spec) {
    const head = positionals[0]
    // Distinguish "unknown top-level command" from "unknown subcommand of a group".
    const isGroup = COMMANDS.some((c) => c.match[0] === head && c.match.length > 1)
    if (isGroup) {
      return {
        kind: 'error',
        message: `unknown subcommand for "${head}". Run \`parchment --help\` for usage.`,
      }
    }
    return {
      kind: 'error',
      message: `unknown command: "${head}". Run \`parchment --help\` for usage.`,
    }
  }

  const rest = positionals.slice(spec.match.length)
  if (rest.length < spec.positionals) {
    return { kind: 'error', message: `"${spec.usage}" requires an argument (usage: ${spec.usage})` }
  }

  return { kind: 'command', command: spec.command, positionals: rest, flags }
}

/** Human-readable help text listing every command. */
export function formatHelp(): string {
  const lines = [
    'parchment — CLI for a self-hosted Parchment instance',
    '',
    'Usage: parchment [--url <base>] [--token <pat>] <command> [args] [flags]',
    '',
    'Commands:',
    ...COMMANDS.map((c) => `  ${c.usage}`),
    '',
    'Global flags:',
    '  --url <base>     Instance base URL (env: PARCHMENT_URL)',
    '  --token <pat>    Personal access token, pat_… (env: PARCHMENT_TOKEN)',
    '  --json           Emit machine-readable JSON',
    '  --dry-run        Print what would happen without mutating',
    '  --help, -h       Show this help',
    '  --version, -v    Show the CLI version',
    '',
    'Token scopes (J8): read-only commands need a docs:read PAT; import/restore',
    'need docs:write. A docs:read token cannot mutate.',
  ]
  return lines.join('\n')
}
