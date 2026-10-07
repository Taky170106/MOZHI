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

export type SpeechLang = 'en-IN' | 'hi-IN' | 'ta-IN'

export const SPEECH_LANGS: { v: SpeechLang; label: string }[] = [
  { v: 'en-IN', label: 'English (India)' },
  { v: 'ta-IN', label: 'தமிழ்' },
  { v: 'hi-IN', label: 'हिन्दी' },
]

/* ============================================================
   Spoken language selection.

   A clerk at a busy window should not have to open a settings page to
   change language mid-conversation: they say "switch to Tamil" and the
   terminal obeys. The utterance is recognised in whichever language the
   recogniser is currently listening in, so the matcher accepts all three
   scripts rather than only the one that is active — otherwise the only way
   to ask for a language would be to already be in it.

   It is deliberately strict about everything ELSE: if the utterance contains
   any word that is neither a language nor one of the command words, it is
   ordinary speech and is returned untouched to the composer. Without that
   rule, a clerk dictating "I speak English" would have the language quietly
   switched instead of the sentence written.
   ============================================================ */

/* Combining marks that carry no identity of their own for matching.
   Tamil and Devanagari spell a word as a consonant plus a stack of vowel
   signs and a virama, and the recogniser will happily emit an equivalent
   but differently-ordered sequence — 'हिन्दी' and 'हिंदी' are the same
   word with a different anusvara. Stripping them compares the consonant
   skeleton, so both land on one key. None of these ranges overlap Latin,
   so English spelling is left completely alone. */
const COMBINING = /[\u0B82\u0B83\u0BBE-\u0BCD\u0BD7\u0902\u0903\u093C\u093E-\u094D\u0951-\u0954]/g
const key = (word: string) => word.toLowerCase().replace(COMBINING, '')

const LANG_WORDS: Record<string, SpeechLang> = {}
const sayLang = (lang: SpeechLang, ...names: string[]) => {
  for (const name of names) LANG_WORDS[key(name)] = lang
}
/* Each language is answered by its own name in every script the counter
   actually hears: an English word, the Tamil word, the Hindi word, and the
   way a Tamil speaker says the other two. */
sayLang('ta-IN', 'tamil', 'tamizh', 'thamizh', 'தமிழ்', 'தமிழில்')
sayLang('en-IN', 'english', 'inglish', 'ஆங்கிலம்', 'இங்கிலீஷ்', 'अंग्रेज़ी', 'अंग्रेजी')
sayLang('hi-IN', 'hindi', 'hindhi', 'हिन्दी', 'हिंदी', 'இந்தி')

/** Words that carry the request rather than the message, so they can be
    dropped before deciding whether anything language-shaped was said. */
const COMMAND_WORDS = new Set<string>()
const addCommand = (...words: string[]) => { for (const w of words) COMMAND_WORDS.add(key(w)) }
addCommand(
  'switch', 'change', 'set', 'select', 'put', 'use', 'speak', 'talk', 'keep',
  'language', 'lang', 'to', 'in', 'on', 'the', 'a', 'an', 'my', 'please',
  'now', 'over', 'from', 'back', 'and', 'or', 'yes', 'yeah', 'ok', 'okay',
  /* the same request, said in the other two scripts */
  'மொழி', 'மாற்று', 'மாற்றவும்', 'பேசு', 'பேசுங்கள்',
  'भाषा', 'बदलें', 'बदलो', 'बोलिए', 'स्विच', 'करें', 'में',
)

/**
 * The language this utterance asks for, or null if it is not a request.
 *
 * Null means "this is dictation — send it on". At most one language may be
 * named: "switch between tamil and english" is not something this terminal
 * does, and picking one of them at random would be worse than doing nothing.
 */
export function matchLanguageCommand(text: string): SpeechLang | null {
  const words = text
    .replace(/[^A-Za-z\u0B80-\u0BFF\u0900-\u097F\s']/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0 || words.length > 8) return null

  const found = new Set<SpeechLang>()
  for (const word of words) {
    const k = key(word)
    if (COMMAND_WORDS.has(k)) continue
    const lang = LANG_WORDS[k]
    if (!lang) return null
    found.add(lang)
  }

  if (found.size !== 1) return null
  const [only] = found
  return only
}

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
