import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import { glossToEnglish } from './glossing'
import { restFrame } from './pose'
import { Segmenter, type SegState } from './segmenter'
import { isNullLabel, loadModel, modelPresent, topOf, type LoadedModel } from './classifier'
import { LandmarkBuffer, islrGloss, islrHealthy, islrPredict } from './islr'
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

/* Which recogniser is behind the lane.

   'tm'   — the Teachable Machine image model in public/models/tm/, running
            in this tab. Sanket's own ISL vocabulary. Preferred whenever it
            is present, because it is the product's actual model.
   'islr' — the PopSign ASL sequence model behind server/islr.py. A bench:
            it reads movement properly, but it is American Sign Language and
            only 22 of its 250 classes reach this lexicon. */
export type Backend = 'none' | 'tm' | 'islr'

const REST = restFrame()

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
  const [sentence, setSentence] = useState('')
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
        setDetail('No model in public/models/tm/, and server/islr.py is not running')
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
    prevSeg.current = 'idle'
    acc.current = null
    accN.current = 0
    lastSample.current = 0
    repeated.current = false
    setCommits([])
    setSentence('')
    setLowconf(null)
    setSegState('idle')
    setHoldProgress(0)
  }, [])

  useEffect(() => { if (!opts.enabled) reset() }, [opts.enabled, reset])

  /* One place turns a recognised sign into a commit, so the two backends
     cannot drift apart on thresholds, repeats or sentence breaks. */
  const commit = useCallback((gloss: string, conf: number) => {
    const entry: Commit = { gloss, conf, at: Date.now() }

    if (conf < thresholdRef.current) {
      /* The terminal stops rather than guessing. */
      repeated.current = true
      setLowconf(entry)
      return
    }

    setLowconf(null)
    /* A sign arriving after a sentence has been written out starts the next
       sentence rather than extending the last one. */
    if (sentenceRef.current) {
      sentenceRef.current = ''
      startedAt.current = Date.now()
      setSentence('')
      setCommits([entry])
    } else {
      if (!commitsRef.current.length) startedAt.current = Date.now()
      setCommits(prev => [...prev, entry])
    }
  }, [])

  const resolveUtterance = useCallback(() => {
    const list = commitsRef.current
    if (!list.length) return
    const glosses = list.map(c => c.gloss)
    const { text } = glossToEnglish(glosses)
    const mean = list.reduce((a, c) => a + c.conf, 0) / list.length
    setSentence(text)
    onResolved.current({
      glosses,
      text,
      conf: mean,
      latency: Math.round(Date.now() - (startedAt.current || Date.now())),
      repeated: repeated.current,
    })
    repeated.current = false
  }, [])

  /* ---- one camera frame --------------------------------------- */
  const onFrame = useCallback(
    (res: HolisticLandmarkerResult | null, video: HTMLVideoElement, t: number) => {
      const mode = backendRef.current
      if (mode === 'none') return

      const tick = seg.current.push(res, t)
      setSegState(tick.state)
      setEnergy(tick.energy)
      setHoldProgress(tick.holdProgress)

      if (mode === 'islr') {
        /* A sequence model is fed the movement, not just the peak, so the
           window opens when the stroke starts rather than when it ends.
           This is the one place the two backends genuinely differ: the
           image model can only see the hold, and this one would learn
           nothing from it. */
        if (tick.state !== 'idle') {
          if (prevSeg.current === 'idle') buf.current.reset()
          buf.current.push(res)
        }
        prevSeg.current = tick.state

        if (tick.event?.type === 'end') { resolveUtterance(); return }
        if (tick.event?.type !== 'hold') return

        const frames = buf.current.take()
        buf.current.reset()
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
              /* 228 of the 250 classes are outside this lexicon, so this is
                 the common case for the bench, not an error. */
              setDetail(`"${best.label}" ${(best.conf * 100).toFixed(0)}% — outside the lexicon`)
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

      /* Hands down long enough: write the sentence out. */
      if (tick.event.type === 'end') resolveUtterance()
    },
    [commit, resolveUtterance],
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
      : sentence
        ? 'done'
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
    meanConf,
    energy,
    segState,
    player: {
      frame: REST,
      progress: sentence ? 1 : holdProgress,
      playing: segState !== 'idle',
      total: 0,
      active: commits.length - 1,
    },
    onFrame,
    retry,
    stop: reset,
  }
}
