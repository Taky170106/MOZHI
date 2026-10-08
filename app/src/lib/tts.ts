import { useCallback, useEffect, useRef, useState } from 'react'

/* ============================================================
   tts.ts — the transcript, said out loud.

   Everything in this product is written: the caption, the log, the reply.
   Two people at a counter cannot always read it — a clerk with their
   hands full of the next file, and a hearing companion standing behind a
   visitor who cannot hear the reply. So the log can be spoken as well as
   shown.

   Two rules decide what comes out of the speaker, and both exist to stop
   the machine producing nonsense:

   1. The VOICE follows the script the line is written in, not the language
      setting. A line the counter could not translate stays English, and
      English read by a Tamil voice — or Tamil read by an English one — is
      noise, not speech.

   2. When this machine has no voice for that script, the caller's English
      fallback is read instead of the original being handed to the wrong
      voice. A wrong accent beats no answer at a window; Tamil characters
      pronounced as English letters beats neither.

   Nothing here asks for a network: `speechSynthesis` is part of the
   browser and its voices are installed with it. Which of those voices the
   browser considers default is the browser's business, and the screen
   says so rather than claiming an offline synthesiser it does not have.
   ============================================================ */

/** Whether this browser has the API at all. */
export const TTS_SUPPORTED =
  typeof window !== 'undefined' && 'speechSynthesis' in window

/** Which family of voices a line needs — decided by its script. */
export type SpeakLang = 'ta' | 'hi' | 'en'

const TAMIL = /[\u0B80-\u0BFF]/
const DEVANAGARI = /[\u0900-\u097F]/

export function scriptOf(text: string): SpeakLang {
  if (TAMIL.test(text)) return 'ta'
  if (DEVANAGARI.test(text)) return 'hi'
  return 'en'
}

/* Preference order inside one script: this counter's locale first, then
   any variant of the language, then anything at all. The last tier is
   deliberately missing for Tamil and Hindi — a voice that does not speak
   the language cannot pronounce it, and pretending otherwise is how a
   terminal ends up reading "நீர் குடிக்கவும்" as letters. */
const PREFER: Record<SpeakLang, string[]> = {
  ta: ['ta-IN', 'ta'],
  hi: ['hi-IN', 'hi'],
  en: ['en-IN', 'en-GB', 'en-US', 'en'],
}

/** The tag to try when there is no voice for the line's script at all. */
const TAG: Record<SpeakLang, string> = { ta: 'ta-IN', hi: 'hi-IN', en: 'en-IN' }

const norm = (l: string) => l.replace(/_/g, '-')

/** The best voice this browser has for a script, or null if it has none. */
export function voiceFor(
  voices: SpeechSynthesisVoice[],
  want: SpeakLang,
): SpeechSynthesisVoice | null {
  for (const tag of PREFER[want]) {
    const hit = voices.find(v => norm(v.lang) === tag)
    if (hit) return hit
  }
  /* `want` is already the base language, so this matches every regional
     variant of it and nothing else. */
  return voices.find(v => norm(v.lang).split('-')[0] === want) ?? null
}

/** One line of the log, plus the untranslated text it falls back to. */
export type SpeakLine = { text: string; fallback?: string }

/** What will be said, and the voice it will be said with. */
export type Picked = { text: string; voice: SpeechSynthesisVoice | null; lang: SpeakLang }

/**
 * The line this browser will actually say, and the voice it will say it with.
 *
 * Returns null for an empty line. Exported because it is the whole policy of
 * this module in one function: script first, installed voice second, English
 * fallback third, silence never.
 */
export function pickLine(line: SpeakLine, voices: SpeechSynthesisVoice[]): Picked | null {
  const primary = line.text.trim()
  if (!primary) return null

  const want = scriptOf(primary)
  const voice = voiceFor(voices, want)
  if (voice) return { text: primary, voice, lang: want }

  const fb = line.fallback?.trim()
  if (fb && fb !== primary) {
    const fbVoice = voiceFor(voices, scriptOf(fb))
    if (fbVoice) return { text: fb, voice: fbVoice, lang: scriptOf(fb) }
  }

  /* No voice for either script. Hand it to the browser's default rather
     than staying silent — the caller was told what would happen. */
  return { text: primary, voice: null, lang: want }
}

export type ReadAloud = {
  /** The API exists here. False means every control below is hidden. */
  supported: boolean
  /** Whether anything is going out of the speaker right now. */
  speaking: boolean
  /** The browser has finished producing its voice list. */
  ready: boolean
  /** Speak a batch: one utterance per line, played in order. */
  say: (lines: SpeakLine[]) => boolean
  /** Cut in. Safe to call when nothing is playing. */
  stop: () => void
}

/**
 * Reading a transcript back.
 *
 * A batch is queued, not concatenated: the lines arrive as separate turns
 * with separate speakers, and one long utterance would be re-uttered from
 * the top every time a new line landed. Each new call replaces whatever
 * was playing, so the terminal always says the newest thing rather than
 * growing an unread backlog of every sentence since the page opened.
 */
export function useReadAloud(): ReadAloud {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [speaking, setSpeaking] = useState(false)

  /* Every utterance carries the generation it was queued in. Cancelling a
     queue makes the browser fire `onerror` for the lines it dropped, and
     those handlers must not touch the counters of the batch that
     replaced them — otherwise a Stop immediately followed by a Read
     leaves `speaking` stuck on. */
  const gen = useRef(0)
  const pending = useRef(0)

  useEffect(() => {
    if (!TTS_SUPPORTED) return
    const synth = window.speechSynthesis
    const load = () => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    /* Chrome fills the list asynchronously and some builds never fire the
       event at all, so the list is also re-read once on a timer. A Tamil
       voice that arrives a frame late would otherwise be missed for the
       whole session, because the first line decides its own fallback. */
    const t = window.setTimeout(load, 600)
    return () => {
      synth.removeEventListener('voiceschanged', load)
      window.clearTimeout(t)
    }
  }, [])

  const stop = useCallback(() => {
    if (!TTS_SUPPORTED) return
    gen.current += 1
    pending.current = 0
    setSpeaking(false)
    window.speechSynthesis.cancel()
  }, [])

  useEffect(() => {
    if (!TTS_SUPPORTED) return
    return () => {
      gen.current += 1
      window.speechSynthesis.cancel()
    }
  }, [])

  const say = useCallback(
    (lines: SpeakLine[]): boolean => {
      if (!TTS_SUPPORTED) return false
      const picked = lines.map(l => pickLine(l, voices)).filter((p): p is Picked => p !== null)
      if (!picked.length) return false

      const synth = window.speechSynthesis
      const myGen = (gen.current += 1)
      synth.cancel()

      pending.current = picked.length
      for (const p of picked) {
        const u = new SpeechSynthesisUtterance(p.text)
        if (p.voice) {
          u.voice = p.voice
          u.lang = p.voice.lang
        } else {
          u.lang = TAG[p.lang]
        }
        u.onstart = () => {
          if (gen.current === myGen) setSpeaking(true)
        }
        u.onend = u.onerror = () => {
          if (gen.current !== myGen) return
          pending.current -= 1
          if (pending.current <= 0) setSpeaking(false)
        }
        synth.speak(u)
      }
      /* Chrome can leave the queue parked in the paused state after a
         cancel(), and a queue that is paused says nothing at all — this
         is what makes the first line actually reach the speaker. */
      synth.resume()
      return true
    },
    [voices],
  )

  return {
    supported: TTS_SUPPORTED,
    speaking,
    ready: voices.length > 0,
    say,
    stop,
  }
}
