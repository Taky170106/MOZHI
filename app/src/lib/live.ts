import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import { restFrame } from './pose'
import { glossToEnglish } from './glossing'
import { Segmenter, type SegState } from './segmenter'
import { clausesOf, readBack } from './recognizer'
import { isNullLabel, loadModel, modelPresent, topOf, type LoadedModel } from './classifier'
import { LandmarkBuffer, islrGloss, islrHealthy, islrPredict } from './islr'
import { sanketGloss, signHealth } from './sanket'
import { SanketEngine } from './sanket-engine'
import type { SignFrame } from './sanket-vision'
import { MODEL_ENABLED } from './flags'
import type { Commit, RecState } from './recognizer'

/* ============================================================
   live.ts — the inbound lane with the simulation taken out.

   useRecognizer() plays a scripted utterance and invents a
   confidence for it. This is the same lane wired to what is
   actually in front of the camera:

     01 camera        CameraField (already real)
     02 landmarks     MediaPipe Holistic (already real)
     03 segmenter     segmenter.ts — motion → hold detection
     04 classifier    classifier.ts — the Teachable Machine model
     05 gloss         glossing.ts (already real)

   It returns the same shape useRecognizer does, so the Counter
   can hold both and swap between them: the model is optional, and
   with no model exported the screen falls back to the scripted
   read rather than showing an empty panel.

   The one rule that matters is in the frame handler below: the
   classifier is only ever asked about frames the segmenter has
   marked as a hold, and its answers across that hold are averaged
   before anything is committed. A per-frame argmax straight off
   the camera would flicker through four glosses a second.
   ============================================================ */

export type ModelStatus = 'absent' | 'loading' | 'ready' | 'error'

/* Which recogniser is behind the lane, in the order they are preferred.

   'sanket' — our own BiGRU behind server/sign.py: 29 ISL signs trained on
              our own recorded corpus, reading the whole movement. This is
              the product's recogniser, so it wins whenever it answers.
   'tm'     — the Teachable Machine image model in public/models/tm/,
              running in this tab. Sanket's vocabulary, but it can only see
              the hold, never the movement into it.
   'islr'   — the PopSign ASL sequence model behind server/islr.py. A bench:
              it reads movement properly, but it is American Sign Language
              and only 22 of its 250 classes reach this lexicon. */
export type Backend = 'none' | 'sanket' | 'tm' | 'islr'

const REST = restFrame()

/* How long the hands must stay quiet after a hold closes before the window
   is read. Long enough to bridge the pause inside a two-beat sign, short
   enough that a visitor is not left waiting on their own sentence. */
const SETTLE_MS = 420
/* A window shorter than this is a twitch between two signs, not a sign. */
const MIN_SIGN_FRAMES = 8
const ISLR_DIM = 543 * 3

/** Minimum gap between two classifications inside one hold. */
const SAMPLE_EVERY_MS = 55

export type LiveRecognizer = {
  status: ModelStatus
  detail: string
  ready: boolean
  backend: Backend
  state: RecState
  commits: Commit[]
  sentence: string
  utterance: string[]
  meanConf: number
  /** smoothed wrist speed, frame-widths/second */
  energy: number
  segState: SegState
  /** shaped like useRecognizer's player so the Counter can swap the two */
  player: { frame: typeof REST; progress: number; playing: boolean; total: number; active: number }
  /** hand every processed camera frame to this */
  onFrame: (res: HolisticLandmarkerResult | null, video: HTMLVideoElement, t: number) => void
  retry: () => void
  /** Hand the pending sentence to the transcript and start a fresh one. */
  send: () => void
  /** Take back the last word only. */
  undo: () => void
  /** How many words are waiting to be sent. */
  pending: number
  /** The pending words, split into the sentences they were signed as. */
  clauses: string[][]
  stop: () => void
}

export function useLiveRecognizer(opts: {
  enabled: boolean
  threshold: number
  onResolved: (r: {
    glosses: string[]
    text: string
    conf: number
    latency: number
    repeated: boolean
  }) => void
}): LiveRecognizer {
  const [status, setStatus] = useState<ModelStatus>('absent')
  const [detail, setDetail] = useState('')
  const [backend, setBackend] = useState<Backend>('none')
  const [commits, setCommits] = useState<Commit[]>([])
  /* Derived, never stored. It is exactly the pending words read back as
     English, and computing it inside a setCommits updater — which is what
     this was — calls a setter during another setter's update and crashes
     React with "Should have a queue". */
  const [lowconf, setLowconf] = useState<Commit | null>(null)
  const [segState, setSegState] = useState<SegState>('idle')
  const [energy, setEnergy] = useState(0)
  const [holdProgress, setHoldProgress] = useState(0)

  const modelRef = useRef<LoadedModel | null>(null)
  const seg = useRef(new Segmenter())
  /* The ASL bench's state: the window of landmarks for the current sign,
     the previous segmenter state (to catch the start of a stroke), and a
     guard so a slow round trip cannot queue a second request behind it. */
  const buf = useRef(new LandmarkBuffer())
  const prevSeg = useRef<SegState>('idle')
  const inflight = useRef(false)
  /* A hold closing is not the same as a sign ending. Signs have pauses
     inside them — the two beats of THANK-YOU, the turn in HOW-MANY — and
     the segmenter closes a hold at each one. Classifying there reads the
     first half of a sign and answers confidently about it.

     So a closed hold only ARMS the read. If the hands move again before the
     settle window is out, the sign was still going and the window keeps
     filling. The read fires when the hands have gone quiet and stayed
     quiet. */
  const armedAt = useRef(0)
  /* Which signed sentence the next word belongs to. The hands coming down
     ends a sentence without sending it, so the next one starts a new clause
     and the two are read back separately. */
  const clause = useRef(0)

  /* Our own model runs its own loop — a rolling window, its own gates —
     because that is the loop it was tested against. See sanket-engine.ts. */
  const engine = useRef(new SanketEngine())
  const backendRef = useRef<Backend>('none')
  backendRef.current = backend
  const commitsRef = useRef<Commit[]>([])
  commitsRef.current = commits

  /* The running sum of softmax vectors across the current hold, and how many
     frames went into it. Kept in a ref because it is written every frame and
     nothing on screen reads it until the hold closes. */
  const acc = useRef<Float64Array | null>(null)
  const accN = useRef(0)
  const lastSample = useRef(0)
  const startedAt = useRef(0)
  const repeated = useRef(false)

  const thresholdRef = useRef(opts.threshold)
  thresholdRef.current = opts.threshold
  const onResolved = useRef(opts.onResolved)
  onResolved.current = opts.onResolved
  /* Read inside the frame handler, which is created once and must not go
     stale as the sentence changes. */
  const sentence = useMemo(() => readBack(commits), [commits])
  const sentenceRef = useRef('')
  sentenceRef.current = sentence

  /* ---- model lifecycle ---------------------------------------- */
  useEffect(() => {
    /* Deliberately not gated on the camera. Loading tfjs and the weights
       and compiling the WebGL shaders costs the better part of ten seconds
       cold, and that cost must not land at the moment someone switches the
       camera on in front of an audience. The Counter is the screen where a
       camera is the whole point, so it starts as soon as the screen opens. */
    let cancelled = false

    /* The warm-up above is why this guard is here and not only at the call
       site: with the classifier switched off, gating the hook's `enabled`
       would still leave this effect to download the weights on open. */
    if (!MODEL_ENABLED) {
      setStatus('absent')
      setBackend('none')
      setDetail('Recogniser disabled — tracking only')
      return
    }

    ;(async () => {
      if (modelRef.current) { setStatus('ready'); setBackend('tm'); return }

      /* Our own model first. It is the only one of the three that is both
         ISL and trained on movement, so nothing else is worth reaching for
         while it answers. */
      setStatus('loading')
      const own = await signHealth()
      if (cancelled) return
      if (own) {
        setBackend('sanket')
        setStatus('ready')
        setDetail(`Mozhi BiGRU · ${own.classes} signs · ISL`)
        return
      }

      /* Sanket's own model wins whenever it exists. The ASL bench is only
         reached when there is nothing else to run. */
      if (await modelPresent()) {
        if (cancelled) return
        setStatus('loading')
        try {
          const m = await loadModel()
          if (cancelled) { m.dispose(); return }
          modelRef.current = m
          setBackend('tm')
          setStatus('ready')
          setDetail(`${m.labels.length} classes · ISL`)
          return
        } catch (err) {
          if (!cancelled) {
            setStatus('error')
            setDetail(String((err as Error)?.message ?? err))
          }
          return
        }
      }

      if (cancelled) return
      setStatus('loading')
      if (await islrHealthy()) {
        if (cancelled) return
        setBackend('islr')
        setStatus('ready')
        setDetail('PopSign ASL · 250 classes · bench')
        return
      }

      if (!cancelled) {
        setBackend('none')
        setStatus('absent')
        setDetail('No recogniser: the ISL model did not load, public/models/tm/ is empty, and server/islr.py is not running')
      }
    })()

    return () => { cancelled = true }
  }, [opts.enabled])

  /* The model is kept across a camera toggle — reloading 2.5MB and
     recompiling shaders every time someone switches the camera off and on
     would put a multi-second stall in the middle of a demo. It is only
     released when the Counter itself goes away. */
  useEffect(() => () => { modelRef.current?.dispose(); modelRef.current = null }, [])

  const reset = useCallback(() => {
    seg.current.reset()
    buf.current.reset()
    engine.current.reset()
    prevSeg.current = 'idle'
    acc.current = null
    accN.current = 0
    lastSample.current = 0
    repeated.current = false
    setCommits([])
    setLowconf(null)
    setSegState('idle')
    setHoldProgress(0)
  }, [])

  useEffect(() => { if (!opts.enabled) reset() }, [opts.enabled, reset])

  /* One place turns a recognised sign into a commit, so the two backends
     cannot drift apart on thresholds, repeats or sentence breaks. */
  /* `gated` is false when the caller has already applied its own acceptance
     rules. Our own model does: sanket-engine.ts runs the confidence floor,
     the two-in-a-row stability check and the one-second debounce the
     checkpoint was tuned with. Re-judging that against the Counter's slider
     put two gates in series — a word confirmed twice at 0.65 is stronger
     evidence than one shot at 0.78, and the second gate was throwing those
     away. That is the "it detects but never recognises" failure. */
  const commit = useCallback((gloss: string, conf: number, gated = true) => {
    const entry: Commit = { gloss, conf, at: Date.now(), clause: clause.current }
    /* The preview reads back the whole pending sentence, not just the word
       that arrived, so the visitor can see it building. */

    if (gated && conf < thresholdRef.current) {
      /* The terminal stops rather than guessing. */
      repeated.current = true
      setLowconf(entry)
      return
    }

    setLowconf(null)
    if (!commitsRef.current.length) startedAt.current = Date.now()
    setCommits(prev => {
      const next = [...prev, entry]
      return next
    })
  }, [])

  /* Nothing reaches the transcript on its own.

     One sign is rarely one sentence. The visitor signs DOCTOR, then SEE,
     then NEED, and the words have to be allowed to accumulate into a
     sentence before anything is written down. Sending is a decision, and it
     belongs to the person at the counter — so this is called from the
     Enter key, never from the segmenter.

     It is also what makes a retry cheap: an unsure word is one word, and
     re-signing it replaces that word instead of the whole sentence. */
  const send = useCallback(() => {
    const list = commitsRef.current
    if (!list.length) return

    /* One turn per signed sentence, not one turn holding all of them. The
       transcript is a record of sentences: giving a line two of them would
       also hand the caption a gloss list with no boundary in it, and the
       Hindi would compose the pair into one clause. */
    const latency = Math.round(Date.now() - (startedAt.current || Date.now()))
    for (const group of clausesOf(list)) {
      if (!group.length) continue
      const words = list.filter(c => group.includes(c.gloss))
      const mean = words.length
        ? words.reduce((a, c) => a + c.conf, 0) / words.length
        : 0
      onResolved.current({
        glosses: group,
        text: glossToEnglish(group).text,
        conf: mean,
        latency,
        repeated: repeated.current,
      })
    }
    repeated.current = false
    startedAt.current = 0
    setCommits([])
    setLowconf(null)
  }, [])

  /* Takes back the last word only. The sentence in front of it stands. */
  const undo = useCallback(() => {
    setLowconf(null)
    setCommits(prev => {
      const next = prev.slice(0, -1)
      return next
    })
  }, [])

  /* ---- one camera frame --------------------------------------- */
  const onFrame = useCallback(
    (
      res: HolisticLandmarkerResult | null,
      video: HTMLVideoElement,
      t: number,
      sign?: SignFrame,
    ) => {
      const mode = backendRef.current
      if (mode === 'none') return

      const tick = seg.current.push(res, t)
      setSegState(tick.state)
      setEnergy(tick.energy)

      /* ---- our own model: its own protocol, not the app's ------------
         The window is rolling and the gates are the model's. Nothing here
         goes through the segmenter's hold events; the segmenter still runs
         because the meter and the drawn field read it. */
      if (mode === 'sanket') {
        if (!sign) return
        engine.current.push(sign, t, e => {
          if (e.type === 'candidate') {
            setDetail(
              e.stable
                ? `"${e.word}" ${(e.conf * 100).toFixed(0)}% · ${e.stable}/2`
                : `"${e.word}" ${(e.conf * 100).toFixed(0)}% — below threshold`,
            )
            return
          }
          const gloss = sanketGloss(e.word)
          if (!gloss) {
            /* Four of the 29 can be read but not signed back yet. */
            setDetail(`"${e.word}" ${(e.conf * 100).toFixed(0)}% — read, but no sign for it yet`)
            return
          }
          commit(gloss, e.conf, false)
        })
        setHoldProgress(engine.current.fill)
        return
      }

      setHoldProgress(tick.holdProgress)

      if (mode === 'islr') {
        /* A sequence model is fed the movement, not just the peak, so the
           window opens when the stroke starts rather than when it ends. The
           image model below can only see the hold and would learn nothing
           from it. */
        if (tick.state !== 'idle') {
          if (prevSeg.current === 'idle') buf.current.reset()
          buf.current.push(res)
        }
        prevSeg.current = tick.state

        /* A new stroke means the sign was not over. Disarm and keep going. */
        if (tick.state === 'moving' && armedAt.current) armedAt.current = 0

        /* The utterance ending is not a decision to send. It only means the
           hands came down — so the sentence closes and the next sign starts
           a new one, and the words of both wait for Enter. */
        if (tick.event?.type === 'end') {
          if (commitsRef.current.length) clause.current += 1
          return
        }

        if (tick.event?.type === 'hold') {
          /* Arm, do not fire. */
          armedAt.current = t
          return
        }

        if (!armedAt.current) return
        const quiet = t - armedAt.current
        /* Hands taken away end the sign immediately — nobody drops their
           hands mid-sign — otherwise wait out the settle. */
        const done = !tick.handsVisible || quiet >= SETTLE_MS
        if (!done) return
        armedAt.current = 0

        const frames = buf.current.take()
        buf.current.reset()

        /* Too short to be a sign at 30fps — a twitch between two of them. */
        if (frames.length < MIN_SIGN_FRAMES * ISLR_DIM) return
        /* A round trip that has not come back yet means the visitor is
           signing faster than the service answers. Dropping this window is
           better than queueing, which would commit signs out of order. */
        if (!frames.length || inflight.current) return

        if (!startedAt.current) startedAt.current = t
        inflight.current = true
        islrPredict(frames)
          .then(r => {
            const best = r?.top?.[0]
            if (!best) return
            const gloss = islrGloss(best.label)
            if (!gloss) {
              /* For the bench this is the common case — 228 of its 250
                 classes are outside this lexicon. For our own model it is
                 four words we can read but cannot yet sign back, and the
                 screen says so rather than substituting something close. */
              setDetail(`"${best.label}" ${(best.conf * 100).toFixed(0)}% — read, but no sign for it yet`)
              return
            }
            commit(gloss, best.conf)
          })
          .finally(() => { inflight.current = false })
        return
      }

      /* ---- Teachable Machine: sample the hold, average, commit ------ */
      const model = modelRef.current
      if (!model) return

      /* Inside a hold: ask the model, and add its answer to the pile.

         Not on every frame. One classification costs ~25ms on this machine
         and MediaPipe is already spending most of a 30fps budget, so
         sampling every frame would drop frames and make the segmenter's own
         speed readings noisier. Consecutive frames inside a hold are nearly
         identical anyway — five spread across the hold average to the same
         answer as nine, for half the work. */
      if (tick.state === 'hold' && !tick.event) {
        if (t - lastSample.current < SAMPLE_EVERY_MS) return
        lastSample.current = t
        const probs = model.predict(video, { res })
        if (!acc.current || acc.current.length !== probs.length) {
          acc.current = new Float64Array(probs.length)
          accN.current = 0
        }
        for (let i = 0; i < probs.length; i++) acc.current[i] += probs[i]
        accN.current++
        if (!startedAt.current) startedAt.current = t
        return
      }

      if (!tick.event) return

      /* The hold closed. Average and commit. */
      if (tick.event.type === 'hold') {
        const sum = acc.current
        const n = accN.current
        acc.current = null
        accN.current = 0
        /* So the next hold's opening frame is always sampled rather than
           falling inside the previous hold's throttle window. */
        lastSample.current = 0
        if (!sum || n === 0) return

        const mean = new Float32Array(sum.length)
        for (let i = 0; i < sum.length; i++) mean[i] = sum[i] / n
        const top = topOf(mean, model.labels)

        /* An explicit background class is the model saying "nobody is
           signing". Believing it is the whole point of having trained it. */
        if (isNullLabel(top.label)) return

        /* A class the lexicon does not know cannot be glossed or signed
           back, so it is not a reading. Surfaced rather than swallowed. */
        if (!top.gloss) {
          setDetail(`Unmapped class "${top.label}" — add it to lexicon.ts`)
          return
        }

        commit(top.gloss, top.conf)
        return
      }

      /* Hands down long enough only ends the sign. The words stay pending
         until someone sends them. */
    },
    [commit],
  )

  const retry = useCallback(() => {
    setLowconf(null)
    seg.current.reset()
    buf.current.reset()
    prevSeg.current = 'idle'
    acc.current = null
    accN.current = 0
    lastSample.current = 0
  }, [])

  const state: RecState = !opts.enabled || status !== 'ready'
    ? 'off'
    : lowconf
      ? 'lowconf'
      : commits.length || segState !== 'idle'
        ? 'reading'
        : 'waiting'

  const meanConf = useMemo(
    () => (commits.length ? commits.reduce((a, c) => a + c.conf, 0) / commits.length : 0),
    [commits],
  )

  return {
    status,
    detail,
    ready: status === 'ready',
    backend,
    state,
    /* The unsure sign is shown as the last chip so the operator can see WHAT
       the machine was unsure about, which is what the retry prompt is for. */
    commits: lowconf ? [...commits, lowconf] : commits,
    sentence,
    utterance: commits.map(c => c.gloss),
    clauses: clausesOf(commits),
    meanConf,
    energy,
    segState,
    player: {
      frame: REST,
      progress: commits.length ? 1 : holdProgress,
      playing: segState !== 'idle',
      total: 0,
      active: commits.length - 1,
    },
    onFrame,
    retry,
    send,
    undo,
    pending: commits.length,
    stop: reset,
  }
}
