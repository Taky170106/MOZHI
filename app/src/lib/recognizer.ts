import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { glossToEnglish } from './glossing'
import { SIGN_BY_ID } from './lexicon'
import { useSignPlayer } from './hooks'

/* ============================================================
   recognizer.ts — the inbound lane, simulated end to end.

   The camera, MediaPipe and the BiGRU are not running in this
   prototype. Everything else is: the segmenter opens and closes a
   window per sign, the classifier emits a confidence, low
   confidence stalls and asks for a repeat, and the gloss sequence
   is written out by the same rules the real pipeline would use.
   ============================================================ */

export type RecState = 'off' | 'waiting' | 'reading' | 'resolving' | 'lowconf' | 'done'

export type Commit = { gloss: string; conf: number; at: number }

/** Deterministic per-sign confidence around its held-out accuracy. */
function confidenceFor(id: string, salt: number, face: boolean) {
  const sign = SIGN_BY_ID[id]
  const base = sign?.acc ?? 0.9
  const n = Math.sin((id.length * 12.9898 + salt * 78.233)) * 43758.5453
  const jitter = (n - Math.floor(n) - 0.5) * 0.16
  /* Without the face channel the model loses the non-manual marking.
     Signs that carry meaning on the face lose the most. */
  const facePenalty = face ? 0 : sign?.nmm ? 0.22 : 0.07
  return Math.max(0.2, Math.min(0.995, base + jitter - 0.03 - facePenalty))
}

export function useRecognizer(opts: {
  threshold: number
  speed: number
  face: boolean
  onResolved: (r: { glosses: string[]; text: string; conf: number; latency: number; repeated: boolean }) => void
}) {
  const [utterance, setUtterance] = useState<string[]>([])
  const [state, setState] = useState<RecState>('off')
  const [commits, setCommits] = useState<Commit[]>([])
  const [sentence, setSentence] = useState('')
  const [attempt, setAttempt] = useState(0)
  const startedAt = useRef(0)
  const repeated = useRef(false)
  const lastActive = useRef(-1)
  const timers = useRef<number[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  const player = useSignPlayer(state === 'reading' ? utterance : [], {
    autoplay: state === 'reading',
    speed: opts.speed,
    idle: true,
  })

  const onResolved = useRef(opts.onResolved)
  onResolved.current = opts.onResolved

  /* commit a gloss each time the segmenter closes a window */
  useEffect(() => {
    if (state !== 'reading') return
    const a = player.active
    if (a === lastActive.current) return
    const finished = lastActive.current
    lastActive.current = a
    if (finished < 0 || finished >= utterance.length) return
    const id = utterance[finished]
    const conf = confidenceFor(id, attempt, opts.face)
    setCommits(c => [...c, { gloss: id, conf, at: Date.now() }])
    if (conf < opts.threshold) {
      repeated.current = true
      clear()
      setState('lowconf')
    }
  }, [player.active, state, utterance, opts.threshold, opts.face, attempt])

  /* when the track ends, commit the tail and write out the sentence */
  useEffect(() => {
    if (state !== 'reading' || player.playing || player.total === 0) return
    if (player.progress < 0.999) return
    const last = utterance.length - 1
    setCommits(c => {
      if (c.length > last) return c
      const conf = confidenceFor(utterance[last], attempt, opts.face)
      return [...c, { gloss: utterance[last], conf, at: Date.now() }]
    })
    setState('resolving')
  }, [player.playing, player.progress, player.total, state, utterance, attempt, opts.face])

  useEffect(() => {
    if (state !== 'resolving') return
    later(() => {
      const glosses = utterance
      const { text } = glossToEnglish(glosses)
      setSentence(text)
      setState('done')
      const confs = commits.map(c => c.conf)
      const mean = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.9
      onResolved.current({
        glosses, text, conf: mean,
        latency: Math.round(Date.now() - startedAt.current),
        repeated: repeated.current,
      })
    }, 620)
    return clear
  }, [state])

  const begin = useCallback((glosses: string[]) => {
    clear()
    lastActive.current = -1
    repeated.current = false
    setAttempt(a => a + 1)
    setUtterance(glosses)
    setCommits([])
    setSentence('')
    setState('waiting')
    startedAt.current = Date.now()
    later(() => setState('reading'), 780)
  }, [])

  /** The visitor repeats the sign the classifier was unsure about. */
  const retry = useCallback(() => {
    clear()
    lastActive.current = -1
    setAttempt(a => a + 1)
    setCommits([])
    setSentence('')
    setState('waiting')
    startedAt.current = Date.now()
    later(() => setState('reading'), 640)
  }, [])

  const stop = useCallback(() => {
    clear()
    setState('off')
    setUtterance([])
    setCommits([])
    setSentence('')
    lastActive.current = -1
  }, [])

  useEffect(() => clear, [])

  const meanConf = useMemo(
    () => (commits.length ? commits.reduce((a, c) => a + c.conf, 0) / commits.length : 0),
    [commits],
  )

  return { state, commits, sentence, utterance, player, begin, retry, stop, meanConf, attempt }
}
