import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLogger } from '../../src/lib/log'

/**
 * Unit tests for src/lib/log.ts (I7).
 *
 * makeLogger accepts optional {level, format} opts so tests can control
 * behaviour without relying on process.env or module cache isolation.
 */

describe('makeLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls console.error for log.error', () => {
    const log = makeLogger('test', { level: 'debug', format: 'text' })
    log.error('hello error')
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('calls console.warn for log.warn', () => {
    const log = makeLogger('test', { level: 'debug', format: 'text' })
    log.warn('hello warn')
    expect(console.warn).toHaveBeenCalledOnce()
  })

  it('calls console.info for log.info', () => {
    const log = makeLogger('test', { level: 'debug', format: 'text' })
    log.info('hello info')
    expect(console.info).toHaveBeenCalledOnce()
  })

  it('calls console.debug for log.debug', () => {
    const log = makeLogger('test', { level: 'debug', format: 'text' })
    log.debug('hello debug')
    expect(console.debug).toHaveBeenCalledOnce()
  })

  it('silences info and debug when level=warn', () => {
    const log = makeLogger('test', { level: 'warn', format: 'text' })
    log.info('should be silent')
    log.debug('should be silent')
    expect(console.info).not.toHaveBeenCalled()
    expect(console.debug).not.toHaveBeenCalled()
  })

  it('passes warn and error when level=warn', () => {
    const log = makeLogger('test', { level: 'warn', format: 'text' })
    log.warn('should pass')
    log.error('should pass')
    expect(console.warn).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('silences warn, info, debug when level=error', () => {
    const log = makeLogger('ns', { level: 'error', format: 'text' })
    log.warn('silent')
    log.info('silent')
    log.debug('silent')
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.info).not.toHaveBeenCalled()
    expect(console.debug).not.toHaveBeenCalled()
  })

  it('only passes error when level=error', () => {
    const log = makeLogger('ns', { level: 'error', format: 'text' })
    log.error('passes')
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('emits parseable JSON with {level,msg,ns,ts} when format=json', () => {
    const log = makeLogger('myns', { level: 'debug', format: 'json' })
    log.info('test message')
    const firstArg = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(typeof firstArg).toBe('string')
    const parsed = JSON.parse(firstArg as string)
    expect(parsed).toMatchObject({ level: 'info', msg: 'test message', ns: 'myns' })
    expect(typeof parsed.ts).toBe('string')
  })

  it('emits [ns] prefix format when format=text', () => {
    const log = makeLogger('sched', { level: 'debug', format: 'text' })
    log.warn('watch out')
    const firstArg = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(typeof firstArg).toBe('string')
    expect(firstArg as string).toContain('[sched]')
    expect(firstArg as string).toContain('watch out')
  })

  it('defaults to level=info when LOG_LEVEL is unset (silences debug)', () => {
    // Save and unset env
    const saved = process.env.LOG_LEVEL
    delete process.env.LOG_LEVEL
    const log = makeLogger('x') // no opts → reads from env (unset → default info)
    log.debug('should be silent')
    expect(console.debug).not.toHaveBeenCalled()
    if (saved !== undefined) process.env.LOG_LEVEL = saved
  })

  it('reads LOG_LEVEL=warn from process.env when no opts given', () => {
    const saved = process.env.LOG_LEVEL
    process.env.LOG_LEVEL = 'warn'
    const log = makeLogger('x')
    log.info('silenced')
    log.warn('passes')
    expect(console.info).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledOnce()
    if (saved !== undefined) process.env.LOG_LEVEL = saved
    else delete process.env.LOG_LEVEL
  })

  it('reads LOG_FORMAT=json from process.env when no opts given', () => {
    const savedFmt = process.env.LOG_FORMAT
    const savedLvl = process.env.LOG_LEVEL
    process.env.LOG_FORMAT = 'json'
    process.env.LOG_LEVEL = 'debug'
    const log = makeLogger('envtest')
    log.error('envjson')
    const firstArg = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const parsed = JSON.parse(firstArg as string)
    expect(parsed.level).toBe('error')
    expect(parsed.ns).toBe('envtest')
    if (savedFmt !== undefined) process.env.LOG_FORMAT = savedFmt
    else delete process.env.LOG_FORMAT
    if (savedLvl !== undefined) process.env.LOG_LEVEL = savedLvl
    else delete process.env.LOG_LEVEL
  })
})
