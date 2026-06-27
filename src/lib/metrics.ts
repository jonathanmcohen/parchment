/**
 * Prometheus counter registry (I1).
 *
 * Server-singleton counter store stored on globalThis for HMR safety (same
 * pattern as the scheduler singleton). Only counters — no histograms in v0.2.0.
 *
 * Counters defined here:
 *   parchment_up            — always 1 (the app is running)
 *   parchment_request_count — incremented by middleware on each matched request
 *   parchment_scheduler_job_count{job,status} — incremented by scheduler
 */

type Labels = Record<string, string>

interface Counter {
  value: number
  labels: Labels
}

// Key format: "name" or "name\x00label=val,label2=val2" (sorted for dedup).
const globalForMetrics = globalThis as unknown as {
  __parchmentCounters?: Map<string, Counter>
}

function registry(): Map<string, Counter> {
  if (!globalForMetrics.__parchmentCounters) {
    globalForMetrics.__parchmentCounters = new Map()
  }
  return globalForMetrics.__parchmentCounters
}

function makeKey(name: string, labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) return name
  const labelStr = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',')
  return `${name}\x00${labelStr}`
}

/** Increment a named counter (with optional labels) by 1. */
export function incrementCounter(name: string, labels?: Labels): void {
  const reg = registry()
  const key = makeKey(name, labels)
  const existing = reg.get(key)
  if (existing) {
    existing.value += 1
  } else {
    reg.set(key, { value: 1, labels: labels ?? {} })
  }
}

/** Serialize all counters to Prometheus text format (text/plain; version=0.0.4). */
export function serializePrometheus(): string {
  const lines: string[] = []

  // Static gauge: the app is up.
  lines.push('parchment_up 1')

  const reg = registry()
  for (const [key, counter] of reg.entries()) {
    const name = key.includes('\x00') ? key.slice(0, key.indexOf('\x00')) : key
    const hasLabels = Object.keys(counter.labels).length > 0
    if (hasLabels) {
      const labelParts = Object.keys(counter.labels)
        .sort()
        .map((k) => `${k}="${counter.labels[k]}"`)
        .join(',')
      lines.push(`${name}{${labelParts}} ${counter.value}`)
    } else {
      lines.push(`${name} ${counter.value}`)
    }
  }

  return `${lines.join('\n')}\n`
}
