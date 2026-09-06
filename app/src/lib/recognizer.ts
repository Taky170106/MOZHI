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

/* `clause` is which signed sentence this word belongs to. A visitor signs
   MY HEAD PAIN, drops their hands, then signs MEDICINE MONEY HOW-MANY —
   that is two sentences waiting to be sent together, and running them
   through the glosser as one clause produces "how many my and my head and
   pain and medicine". The boundary has to survive. */
export type Commit = { gloss: string; conf: number; at: number; clause: number }

/** The pending words, split back into the sentences they were signed as. */
export function clausesOf(commits: Commit[]): string[][] {
  const out: string[][] = []
  let at = -1
  for (const c of commits) {
    if (c.clause !== at) { out.push([]); at = c.clause }
    out[out.length - 1].push(c.gloss)
  }
  return out
}

/** Those sentences, read back as English. */
export function readBack(commits: Commit[]): string {
  return clausesOf(commits)
    .map(g => glossToEnglish(g).text)
    .filter(Boolean)
    .join(' ')
}

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
  /* Derived below, never stored: writing it from inside a setCommits
     updater calls a setter during another setter's update, which React
     answers with "Should have a queue". */
  const [attempt, setAttempt] = useState(0)
  const startedAt = useRef(0)
  const repeated = useRef(false)
  /* The pending list read from callbacks that must not re-create on every
     commit. */
  const commitsRef = useRef<Commit[]>([])
  commitsRef.current = commits
  const sentence = useMemo(() => readBack(commits), [commits])
  /* How many words were already pending when this read started. The tail
     check below counts within THIS utterance, so it needs the offset — and
     the offset is what lets a second read add to the sentence in front of
     it instead of replacing it. */
  const base = useRef(0)
  /* Bumped once per read, so every word of one read shares a clause. */
  const clause = useRef(0)
  /* How many words of THIS read have been committed. Progress is used
     rather than the player's active index because the index is stale for a
     render after a new track starts — it still holds the last track's
     value, which swallowed the opening words of every read after the first.
     Progress resets to zero with the track. */
  const done = useRef(0)
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
    if (state !== 'reading' || !utterance.length) return

    /* One word lands each time the track passes another of its boundaries.
       The last is left to the tail effect below, so a sign is never
       committed before its hold has actually finished. */
    const passed = Math.min(utterance.length - 1, Math.floor(player.progress * utterance.length))
    if (passed <= done.current) return

    const id = utterance[done.current]
    const conf = confidenceFor(id, attempt, opts.face)
    done.current += 1
    setCommits(c => [...c, { gloss: id, conf, at: Date.now(), clause: clause.current }])
    if (conf < opts.threshold) {
      repeated.current = true
      clear()
      setState('lowconf')
    }
  }, [player.progress, state, utterance, opts.threshold, opts.face, attempt])

  /* when the track ends, commit the tail and write out the sentence */
  useEffect(() => {
    if (state !== 'reading' || player.playing || player.total === 0) return
    if (player.progress < 0.999) return
    const last = utterance.length - 1
    if (done.current > last) { setState('resolving'); return }

    /* Everything the track passed on its final frames, not just the last
       word: at three words a step of the progress meter can cross two
       boundaries at once, and committing only the last dropped the middle
       of every read. */
    const rest = utterance.slice(done.current).map(id => ({
      gloss: id,
      conf: confidenceFor(id, attempt, opts.face),
      at: Date.now(),
      clause: clause.current,
    }))
    done.current = last + 1

    /* The threshold applies to these too. Without this a word that arrived
       in the closing batch skipped the check entirely and a read could end
       below the threshold without ever stalling. */
    const bad = rest.findIndex(r => r.conf < opts.threshold)
    if (bad >= 0) {
      /* The unsure word is shown as the last chip, the way the progressive
         path already shows it, so the operator can see WHAT the machine was
         unsure about. Anything after it is not read at all. */
      setCommits(c => [...c, ...rest.slice(0, bad + 1)])
      repeated.current = true
      clear()
      setState('lowconf')
      return
    }

    setCommits(c => [...c, ...rest])
    setState('resolving')
  }, [player.playing, player.progress, player.total, state, utterance, attempt, opts.face])

  /* The read finishes; the sentence does NOT go anywhere on its own. It
     waits with the live lane's words for someone to send it, so a visitor
     can sign three words into one sentence and a bad word can be retried
     without losing the two good ones in front of it. */
  useEffect(() => {
    if (state !== 'resolving') return
    later(() => {
      setState('done')
    }, 620)
    return clear
  }, [state])

  const send = useCallback(() => {
    /* What is sent is everything pending, not just the last read. */
    const list = commitsRef.current
    if (!list.length) return

    /* One turn per signed sentence — see the same loop in live.ts. */
    const latency = Math.round(Date.now() - startedAt.current)
    for (const group of clausesOf(list)) {
      if (!group.length) continue
      const words = list.filter(c => group.includes(c.gloss))
      const mean = words.length
        ? words.reduce((a, c) => a + c.conf, 0) / words.length
        : 0.9
      onResolved.current({
        glosses: group,
        text: glossToEnglish(group).text,
        conf: mean,
        latency,
        repeated: repeated.current,
      })
    }
    repeated.current = false
    base.current = 0
    setCommits([])
    setUtterance([])
    setState('off')
  }, [commits])

  const undo = useCallback(() => {
    setCommits(prev => {
      const next = prev.slice(0, -1)
      return next
    })
  }, [])

  /* A second read joins the sentence already waiting rather than wiping it:
     a visitor signs DOCTOR, then SEE, then NEED, and those are one sentence
     until someone sends it. */
  const begin = useCallback((glosses: string[]) => {
    clear()
    repeated.current = false
    setAttempt(a => a + 1)
    setUtterance(glosses)
    base.current = commitsRef.current.length
    clause.current += 1
    done.current = 0
    setState('waiting')
    startedAt.current = Date.now()
    later(() => setState('reading'), 780)
  }, [])

  /** The visitor repeats the sign the classifier was unsure about. */
  /* Only the word that was unsure is signed again — not the sentence, and
     not even the rest of the read it arrived in. The words in front of it
     stay exactly where they were, and the new attempt lands back in the
     same sentence. */
  const retry = useCallback(() => {
    clear()
    const list = commitsRef.current
    const bad = list[list.length - 1]
    if (!bad) return
    setAttempt(a => a + 1)
    setCommits(list.slice(0, -1))
    base.current = list.length - 1
    clause.current = bad.clause
    done.current = 0
    setUtterance([bad.gloss])
    setState('waiting')
    later(() => setState('reading'), 640)
  }, [])

  const stop = useCallback(() => {
    clear()
    setState('off')
    setUtterance([])
    setCommits([])
  }, [])

  useEffect(() => clear, [])

  const meanConf = useMemo(
    () => (commits.length ? commits.reduce((a, c) => a + c.conf, 0) / commits.length : 0),
    [commits],
  )

  return {
    state, commits, sentence, utterance, player, begin, retry, send, undo,
    clauses: clausesOf(commits),
    pending: commits.length, stop, meanConf, attempt,
  }
}
