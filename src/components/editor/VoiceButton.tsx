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
      stopRecording()
    }

    rec.onend = () => {
      // Only auto-clear if not already stopped by user action.
      setRecording(false)
      setPreview('')
      recRef.current = null
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
        {recording ? '🔴' : '🎤'}
      </button>

      {/* Live preview chip — shows interim (in-progress) transcription */}
      <span aria-live="polite" aria-atomic="true" className="parchment-voice-preview">
        {preview}
      </span>

      {/* Unsupported note — announced via aria-live */}
      {unsupported && (
        <span role="status" aria-live="polite" className="parchment-voice-unsupported">
          Voice typing isn&apos;t supported in this browser
        </span>
      )}
    </>
  )
}
