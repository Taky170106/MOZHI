import { FEATURE_DIM, SEQUENCE_LENGTH, signPredict, type SignPrediction } from './sanket'
import type { SignFrame } from './sanket-vision'

/* ============================================================
   sanket-engine.ts — the model's own live protocol, in the browser.

   A port of InferenceEngine.process_frame() from realtime_infer.py, which
   is the loop the checkpoint was tested against. The earlier integration
   invented its own: it cut one window per sign with the app's segmenter,
   classified it once, and judged it against the Counter's 78% threshold.
   The model was trained and tuned for something quite different —

      · a ROLLING window of the last 30 frames, not a cut one
      · classified every frame, not once per sign
      · accepted at 0.50, not 0.78
      · and only after the same word comes back again — see STABILITY
        below for how that has to be reworded for a loop that classifies
        every frame instead of every third
      · with a one-second debounce against repeats

   — which is why it read far better on the bench than in the product.
   Every constant below is from config.py, except the four at the end of
   the block, which exist because the browser loop made two of the
   reference gates vacuous. See each for why.
   ============================================================ */

/* One source of truth: the window length is the model's, not the loop's. */
export { SEQUENCE_LENGTH }
const INFERENCE_EVERY_N_FRAMES = 1
const CONFIDENCE_THRESHOLD = 0.5
const DEBOUNCE_MS = 1000
const NO_PERSON_FRAMES_TO_IDLE = 5
/* A hand landmarker that misses for a frame is normal in poor light. Wiping
   the whole window over it costs a full second of rebuilding, every time it
   flickers — so a gap is survived and only a sustained absence clears. */
const HAND_LOSS_FRAMES_TO_IDLE = 6
const REST_MOTION_THRESHOLD = 0.015
const REST_FRAMES_TO_IDLE = 90

/* ---- what the browser loop has to add ------------------------------- */

/* The reference accepts a word only after the SAME word comes back twice
   in a row. This loop classifies every frame rather than every third —
   config.py dropped the stride because it was the main source of perceived
   slowness — which broke that test two ways at once:

     · two frames apart is the same input twice, a 30-frame rolling window
       shifted by one frame answers the same way, and the gate passed by
       construction; and
     · two samples a FIXED distance apart alias against a reading that
       oscillates. A model that flips between two words every other frame
       lands the samples on the same phase every time and they agree,
       while a single stray read between them wiped the pair and refused
       a word the machine was naming ninety percent of the time.

   So the pair is replaced by a share: every confident reading is kept for
   the last STABILITY_WINDOW_MS, the judgement needs STABILITY_MIN_GAP_MS
   of those to have accumulated, and the word has to account for
   STABILITY_AGREE of them. A share over a span cannot be phased away by
   oscillation, and it does not punish the model for the occasional
   transit frame it reads wrong. */
const STABILITY_WINDOW_MS = 600
const STABILITY_MIN_GAP_MS = 300
const STABILITY_AGREE = 0.7

/* A hand that appears for two frames and vanishes is the landmarker
   flickering, not a signer raising an arm. Nothing accumulates until the
   hand has stayed, so a ghost cannot buy its way into the stability span
   by showing up twice quickly. */
const HAND_ONSET_FRAMES = 5

/* How much of the previous readings survives the next one. The smoothed
   value for a word is a moving average of what the model said about THAT
   word, which converges on the reading itself when the model holds a sign
   and stays near nothing when the model flails. It is the cheapest
   available stand-in for the hold average the image lane takes over a
   closed hold, and it is what turns "the top class changed again" into a
   reason not to write anything down. */
const SMOOTHING = 0.7

export type Scene = 'no-person' | 'at-rest' | 'listening' | 'signing'

/** Why a reading did not become a word — the panel says which, because
    "nothing happened" and "I am not sure about that" are different
    answers to give a person standing at a counter. */
export type CandidateReason = 'confidence' | 'agreement' | 'settling' | 'stability'

export type EngineEvent =
  /** A word that passed confidence, agreement, stability and debounce. */
  | { type: 'accept'; word: string; conf: number }
  /** What the model said before the gates, for the operator's read.
      `stable` of `seen` is how much of the recent span named this word. */
  | { type: 'candidate'; word: string; conf: number; stable: number; seen: number; reason: CandidateReason }

/**
 * One signer's rolling state. Not shared: the buffer, the last emission and
 * the motion history all belong to a single stream.
 */
export class SanketEngine {
  private buf: Float32Array[] = []
  private prev: Float32Array | null = null
  private noPerson = 0
  private noHand = 0
  private lowMotion = 0
  private frames = 0
  private recent: { label: string; at: number }[] = []
  private smooth = new Map<string, number>()
  private handsRun = 0
  private lastWord = ''
  private lastAt = 0
  private inflight = false
  private hands = false

  scene: Scene = 'listening'
  /** Whether a hand passed the shape test on the frame just pushed. */
  get handsHere() { return this.hands }
  /** How full the rolling window is, 0..1 — the meter on screen. */
  get fill() { return Math.min(1, this.buf.length / SEQUENCE_LENGTH) }

  reset() {
    this.buf = []
    this.prev = null
    this.noPerson = 0
    this.noHand = 0
    this.lowMotion = 0
    this.frames = 0
    this.recent = []
    this.smooth.clear()
    this.handsRun = 0
    this.lastWord = ''
    this.lastAt = 0
    this.hands = false
    this.scene = 'listening'
  }

  private clearWindow(scene: Scene) {
    this.buf = []
    this.recent = []
    this.smooth.clear()
    this.noHand = 0
    this.handsRun = 0
    this.scene = scene
  }

  /**
   * Feed one frame. Returns nothing directly — a classification is a round
   * trip to the service, so results arrive through `onEvent`.
   */
  push(frame: SignFrame, now: number, onEvent: (e: EngineEvent) => void) {
    const { vec, handsFound, personPresent } = frame
    this.hands = handsFound

    /* 1 — nobody there. */
    if (!personPresent) {
      this.noPerson += 1
      if (this.noPerson >= NO_PERSON_FRAMES_TO_IDLE) {
        this.clearWindow('no-person')
        this.prev = null
        this.lowMotion = 0
        return
      }
    } else {
      this.noPerson = 0
    }

    /* 2 — there, but not moving. Someone standing at a counter is not
       signing, and classifying their stillness produces a word. */
    if (this.prev) {
      let sum = 0
      for (let i = 0; i < FEATURE_DIM; i++) {
        const d = vec[i] - this.prev[i]
        sum += d * d
      }
      if (Math.sqrt(sum) < REST_MOTION_THRESHOLD) this.lowMotion += 1
      else this.lowMotion = 0
    }
    this.prev = vec.slice()

    if (this.lowMotion >= REST_FRAMES_TO_IDLE) {
      this.clearWindow('at-rest')
      return
    }

    /* 3 — hands are what make it a sign. A single missed detection is a
       flicker of the landmarker, not the signer vanishing: dropping the
       whole window there costs a full second of rebuilding every time it
       hiccups. Only a sustained gap clears it, so the frames already
       gathered are kept through the blink. */
    if (!handsFound) {
      this.handsRun = 0
      this.noHand += 1
      if (this.noHand >= HAND_LOSS_FRAMES_TO_IDLE) {
        this.clearWindow('listening')
        this.prev = null
        this.lowMotion = 0
      }
      return
    }
    this.noHand = 0

    /* 3b — and it has to STAY there. The first frames after a hand
       appears carry no evidence yet, and they are exactly the frames a
       phantom detection produces before it lets go again.

       They are now COUNTED but not JUDGED. Withholding them from the
       window entirely pushed the first classification out by
       HAND_ONSET_FRAMES on top of a cost already fixed at
       SEQUENCE_LENGTH frames — pure latency, since nothing can be read
       until the window is full anyway. Admitting them surrenders no gate:
       the stability history stays closed, no inference runs over them,
       and every check below still receives exactly the frames it did
       before. Only the wait until the window can fill gets shorter. */
    const onset = ++this.handsRun < HAND_ONSET_FRAMES
    if (onset) {
      this.recent = []
      this.scene = 'listening'
    } else {
      this.scene = 'signing'
    }

    this.buf.push(vec.slice())
    if (this.buf.length > SEQUENCE_LENGTH) this.buf.shift()
    this.frames += 1
    if (onset) return

    /* 4 — a full window, and only every third frame of it. */
    if (this.buf.length < SEQUENCE_LENGTH) return
    if (this.frames % INFERENCE_EVERY_N_FRAMES !== 0) return
    /* A round trip still in the air means the signer is ahead of the
       service. Dropping this window beats queueing, which would deliver
       words out of order. */
    if (this.inflight) return

    const flat = new Float32Array(SEQUENCE_LENGTH * FEATURE_DIM)
    for (let i = 0; i < SEQUENCE_LENGTH; i++) flat.set(this.buf[i], i * FEATURE_DIM)

    this.inflight = true
    signPredict(flat)
      .then(r => {
        const top = r?.top
        if (!top?.length) return
        this.gate(top, now, onEvent)
      })
      .finally(() => { this.inflight = false })
  }

  /* Fold this reading into the moving average, and forget the words that
     have not been said for a while. Values decay toward zero rather than
     being deleted outright, so a word keeps a little evidence across a
     one-frame stumble — but never enough to outvote a word the model is
     actually naming. */
  private fold(top: SignPrediction[]) {
    for (const [k, v] of this.smooth) {
      const next = v * SMOOTHING
      if (next < 1e-4) this.smooth.delete(k)
      else this.smooth.set(k, next)
    }
    const weight = 1 - SMOOTHING
    for (const p of top) {
      this.smooth.set(p.label, (this.smooth.get(p.label) ?? 0) + p.conf * weight)
    }
  }

  /** The smoothed leader — what the model has been saying, not what it
      said this once. */
  private smoothedTop(): { label: string; conf: number } | null {
    let label = ''
    let best = -1
    for (const [k, v] of this.smooth) {
      if (v > best) { best = v; label = k }
    }
    return best < 0 ? null : { label, conf: best }
  }

  /** Confidence, agreement, then stability — in that order. */
  private gate(top: SignPrediction[], now: number, onEvent: (e: EngineEvent) => void) {
    const best = top[0]
    this.fold(top)

    /* Under the floor is not evidence, it is the model saying it does not
       know. Keeping it would let a run of weak reads stand in for a
       confident one. */
    if (best.conf < CONFIDENCE_THRESHOLD) {
      this.recent = []
      onEvent({ type: 'candidate', word: best.label, conf: best.conf, stable: 0, seen: 0, reason: 'confidence' })
      return
    }

    /* Recorded BEFORE the gates below, so the span holds what the model
       actually said rather than only what it said while it happened to
       agree with itself — a share measured on the subset that already
       passed would always be 100% and would prove nothing. */
    this.recent.push({ label: best.label, at: now })
    this.recent = this.recent.filter(e => now - e.at <= STABILITY_WINDOW_MS)

    const seen = this.recent.length
    const stable = this.recent.reduce((n, e) => n + (e.label === best.label ? 1 : 0), 0)

    /* The word named this frame has to be the word the last second has
       been naming. A reading that flips class between two confusable
       words is the model admitting it cannot separate them, and neither
       belongs in a sentence in front of a visitor. Early on the average
       has nothing to say yet, which is reported as its own thing rather
       than as doubt. */
    const smooth = this.smoothedTop()
    if (!smooth || smooth.conf < CONFIDENCE_THRESHOLD) {
      onEvent({ type: 'candidate', word: best.label, conf: best.conf, stable, seen, reason: 'settling' })
      return
    }
    if (smooth.label !== best.label) {
      onEvent({ type: 'candidate', word: best.label, conf: best.conf, stable, seen, reason: 'agreement' })
      return
    }

    onEvent({ type: 'candidate', word: best.label, conf: best.conf, stable, seen, reason: 'stability' })

    /* Enough span to be judging over — one frame is not a pattern — and
       then the word has to account for most of it. */
    if (now - this.recent[0].at < STABILITY_MIN_GAP_MS) return
    if (stable / seen < STABILITY_AGREE) return

    /* The same sign twice in a row is a repeat, not a re-read of the one
       just accepted. */
    if (best.label === this.lastWord && now - this.lastAt < DEBOUNCE_MS) return

    this.lastWord = best.label
    this.lastAt = now
    this.recent = []
    onEvent({ type: 'accept', word: best.label, conf: best.conf })
  }
}
