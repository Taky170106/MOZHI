import { useCallback, useEffect, useRef, useState } from 'react'

/* ============================================================
   speech.ts — the clerk's other input.

   A clerk at a busy window speaks faster than they type. The visitor
   signs, the clerk speaks, and neither of them touches a keyboard.

   IMPORTANT, and stated wherever this is switched on: the browser's
   SpeechRecognition is NOT on-device. Chrome streams the microphone to a
   Google service and sends text back. Everything else in this product runs
   in the page — the landmarks, the segmenter, the classifier, the avatar —
   so this is the one part that needs a network, and it is therefore off by
   default, opt-in per counter, and labelled on screen while it listens.

   Typing stays the offline path and is never removed. Nothing here is
   required to run the counter.
   ============================================================ */

type SpeechCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechResultEvent = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

const ctor = (): SpeechCtor | null => {
  const w = window as unknown as Record<string, SpeechCtor | undefined>
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Whether this browser has the API at all. Firefox does not. */
export const speechSupported = () => typeof window !== 'undefined' && ctor() !== null

export type SpeechLang = 'en-IN' | 'hi-IN'

export const SPEECH_LANGS: { v: SpeechLang; label: string }[] = [
  { v: 'en-IN', label: 'English (India)' },
  { v: 'hi-IN', label: 'हिन्दी' },
]

export type SpeechState = 'idle' | 'listening' | 'error'

const MESSAGE: Record<string, string> = {
  'not-allowed': 'Microphone blocked by the browser.',
  'service-not-allowed': 'Microphone blocked by the browser.',
  network: 'No network — speech needs one. Type instead.',
  'no-speech': 'Nothing heard. Try again.',
  'audio-capture': 'No microphone found.',
  aborted: '',
}

export type Speech = {
  supported: boolean
  state: SpeechState
  /** What is being said right now, before the service settles on it. */
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  toggle: () => void
}

/**
 * One utterance per press.
 *
 * `continuous` is deliberately off: a counter microphone that stays open
 * between visitors is a recording device, and this is not one. The clerk
 * presses, says the line, and the recogniser closes itself.
 *
 * `onFinal` receives the settled transcript. It does not send — the text
 * lands in the composer and the clerk still presses Enter, because a
 * misheard sentence must not reach the avatar unread.
 */
export function useSpeech({
  lang, enabled, onFinal,
}: {
  lang: SpeechLang
  enabled: boolean
  onFinal: (text: string) => void
}): Speech {
  const [supported] = useState(speechSupported)
  const [state, setState] = useState<SpeechState>('idle')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<SpeechRecognitionLike | null>(null)

  /* The callback is read through a ref so restarting is never necessary
     when the composer's state changes underneath a live recogniser. */
  const finalRef = useRef(onFinal)
  finalRef.current = onFinal

  const stop = useCallback(() => {
    ref.current?.stop()
    ref.current = null
    setState('idle')
    setInterim('')
  }, [])

  const start = useCallback(() => {
    if (!enabled) return
    const C = ctor()
    if (!C) { setError('This browser has no speech recognition.'); setState('error'); return }
    if (ref.current) return

    const rec = new C()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => { setError(null); setState('listening') }

    rec.onresult = e => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) {
          const said = text.trim()
          if (said) finalRef.current(said)
        } else {
          live += text
        }
      }
      setInterim(live)
    }

    rec.onerror = e => {
      const msg = MESSAGE[e.error] ?? `Speech failed: ${e.error}`
      /* An abort is the clerk pressing stop; that is not an error state. */
      if (msg) { setError(msg); setState('error') } else { setState('idle') }
      ref.current = null
      setInterim('')
    }

    rec.onend = () => {
      ref.current = null
      setInterim('')
      setState(s => (s === 'error' ? s : 'idle'))
    }

    try {
      rec.start()
      ref.current = rec
      setState('listening')
    } catch {
      ref.current = null
      setState('idle')
    }
  }, [enabled, lang])

  const toggle = useCallback(() => {
    if (ref.current) stop()
    else start()
  }, [start, stop])

  /* Switching the setting off, or leaving the screen, closes the microphone
     immediately rather than at the end of the current utterance. */
  useEffect(() => {
    if (!enabled && ref.current) stop()
  }, [enabled, stop])

  useEffect(() => () => { ref.current?.abort(); ref.current = null }, [])

  return { supported, state, interim, error, start, stop, toggle }
}
