'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechRecognitionLike } from '@/lib/editor/voice'
import { formatTranscript, getSpeechRecognition } from '@/lib/editor/voice'

type Props = {
  editor: Editor
}

// Prevent the toolbar from stealing the editor selection on click.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

/**
 * Mic button that toggles Web Speech API dictation.
 * Always renders — support is checked at START time (when clicked), reading
 * window.SpeechRecognition fresh so tests can inject a fake constructor.
 */
export function VoiceButton({ editor }: Props) {
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState('')
  const [unsupported, setUnsupported] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  // Determine whether the cursor is at a sentence start and whether the
  // preceding character is whitespace, so formatTranscript can capitalize and
  // add a joining space correctly.
  const getInsertionContext = useCallback((): {
    atSentenceStart: boolean
    precededBySpace: boolean
  } => {
    const { from } = editor.state.selection
    if (from === 0) return { atSentenceStart: true, precededBySpace: true }

    // Read up to 2 characters before the cursor for context.
    const before = editor.state.doc.textBetween(Math.max(0, from - 2), from, '\n')
    const lastChar = before.at(-1) ?? ''
    const precededBySpace = lastChar === '' || lastChar === ' ' || lastChar === '\n'
    const penultimate = before.at(-2) ?? ''
    const atSentenceStart =
      lastChar === '' || lastChar === '\n' || /[.!?]/.test(penultimate) || /[.!?]/.test(lastChar)

    return { atSentenceStart, precededBySpace }
  }, [editor])

  const stopRecording = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop()
      recRef.current = null
    }
    setRecording(false)
    setPreview('')
  }, [])

  const startRecording = useCallback(() => {
    // Fix #1: Use ref as authoritative guard against double-start (stale React
    // state in the closure can let a second click slip through before setState
    // propagates; the ref is always current).
    if (recRef.current) return

    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setUnsupported(true)
      return
    }
    setUnsupported(false)

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'

    rec.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const item = result[0]
        if (!item) continue
        const raw = item.transcript

        if (result.isFinal) {
          const ctx = getInsertionContext()
          const text = formatTranscript(raw, ctx)
          if (text) {
            editor.chain().focus().insertContent(text).run()
          }
        } else {
          interimText += raw
        }
      }
      setPreview(interimText)
    }

    rec.onerror = () => {
      // Fix #3 / #7: Guard with session identity — a stale onerror from a
      // superseded session must not stop the new session. Null both handlers
      // before calling stop() so the stop() call doesn't trigger onend
      // recursively (Web Speech API fires onend after onerror + stop()).
      if (recRef.current !== rec) return
      rec.onend = null
      rec.onerror = null
      stopRecording()
    }

    rec.onend = () => {
      // Fix #2 / #5 / #7: Session identity guard — if this rec is no longer
      // the active one (either stopRecording() already ran and nulled the ref,
      // or a new session started), treat this onend as a no-op. This prevents:
      //   • double-execution of teardown state setters after user stops
      //   • post-unmount setState calls (unmount cleanup nulls the ref first)
      //   • a stale onend from a previous session wiping the new session's ref
      if (recRef.current !== rec) return
      recRef.current = null
      setRecording(false)
      setPreview('')
    }

    recRef.current = rec
    rec.start()
    setRecording(true)
  }, [editor, getInsertionContext, stopRecording])

  const handleClick = useCallback(() => {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [recording, startRecording, stopRecording])

  // Clean up on unmount — no dangling recognition.
  useEffect(() => {
    return () => {
      if (recRef.current) {
        // Fix #4: Null all callbacks before abort() so no handler fires after
        // unmount. The browser queues onresult/onerror/onend as tasks; if they
        // were queued before abort() they would otherwise still execute on a
        // dead component, inserting content into the editor or calling state
        // setters after unmount.
        recRef.current.onresult = null
        recRef.current.onerror = null
        recRef.current.onend = null
        recRef.current.abort()
        recRef.current = null
      }
    }
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label="Voice typing"
        aria-pressed={recording}
        className={`parchment-toolbar-btn${recording ? ' parchment-toolbar-btn--recording' : ''}`}
        onMouseDown={keepSelection}
        onClick={handleClick}
      >
        <span aria-hidden className="material-symbols-rounded text-[20px]">
          {recording ? 'stop_circle' : 'mic'}
        </span>
      </button>

      {/* Live preview chip — shows interim (in-progress) transcription */}
      <span aria-live="polite" aria-atomic="true" className="parchment-voice-preview">
        {preview}
      </span>

      {/* Fix #6: Unsupported note — always in the DOM so VoiceOver observes
          mutations to the existing live region rather than a freshly-mounted
          node (ARIA spec requires regions be present before content changes). */}
      <span role="status" aria-live="polite" className="parchment-voice-unsupported">
        {unsupported ? <>Voice typing isn&apos;t supported in this browser</> : null}
      </span>
    </>
  )
}
