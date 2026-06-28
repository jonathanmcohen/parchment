/**
 * Structured logger (I7).
 *
 * Safe to import in both client and server contexts:
 * - Never imports @/db or any server-only module.
 * - On the client, level filtering always passes through (env vars are not
 *   available); JSON format is never emitted on the client.
 * - On the server, LOG_LEVEL (error/warn/info/debug, default: 'info') gates
 *   which levels pass through. LOG_FORMAT=json emits a JSON line; otherwise
 *   emits the legacy '[ns] message' text format.
 *
 * No network telemetry — local structured logging only (§1j).
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface Logger {
  error(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
}

// Level numeric order: error=0, warn=1, info=2, debug=3
const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

function resolveLevel(raw: string | undefined): LogLevel {
  const v = raw?.toLowerCase()
  if (v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v
  return 'info'
}

function resolveFormat(raw: string | undefined): 'json' | 'text' {
  return raw === 'json' ? 'json' : 'text'
}

/**
 * Create a namespaced logger. Reads LOG_LEVEL and LOG_FORMAT from process.env
 * at call time (not module-load time), so tests can set env before calling
 * makeLogger without module cache issues.
 */
export function makeLogger(
  ns: string,
  opts?: { level?: LogLevel; format?: 'json' | 'text' },
): Logger {
  // Resolve at logger-creation time so process.env overrides in tests work.
  const isClient = typeof process === 'undefined'
  const level = opts?.level ?? (isClient ? 'debug' : resolveLevel(process.env.LOG_LEVEL))
  const format = opts?.format ?? (isClient ? 'text' : resolveFormat(process.env.LOG_FORMAT))

  function emit(lvl: LogLevel, msg: string, args: unknown[]): void {
    if (LEVEL_ORDER[lvl] > LEVEL_ORDER[level]) return

    const fn =
      lvl === 'error'
        ? console.error
        : lvl === 'warn'
          ? console.warn
          : lvl === 'debug'
            ? console.debug
            : console.info

    if (format === 'json') {
      fn(JSON.stringify({ level: lvl, msg, ns, ts: new Date().toISOString() }), ...args)
    } else {
      fn(`[${ns}] ${msg}`, ...args)
    }
  }

  return {
    error: (msg, ...args) => emit('error', msg, args),
    warn: (msg, ...args) => emit('warn', msg, args),
    info: (msg, ...args) => emit('info', msg, args),
    debug: (msg, ...args) => emit('debug', msg, args),
  }
}
