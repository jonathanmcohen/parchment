// Next 16 runs register() once per server process (instrumentation is stable;
// no experimental flag needed). We use it to start the F2 disk reverse-sync
// watcher on the Node.js server runtime only — never on the Edge runtime, where
// node:fs / chokidar are unavailable.
//
// A relative import (not the '@/' alias) is used so resolution is unambiguous in
// the instrumentation entrypoint.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startDiskWatcher } = await import('./src/lib/disk/watcher')
  await startDiskWatcher()
}
