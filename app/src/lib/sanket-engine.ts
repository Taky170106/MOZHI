import { FEATURE_DIM, signPredict, type SignPrediction } from './sanket'
import type { SignFrame } from './sanket-vision'

/* ============================================================
   sanket-engine.ts — the model's own live protocol, in the browser.

   A port of InferenceEngine.process_frame() from realtime_infer.py, which
   is the loop the checkpoint was tested against. The earlier integration
   invented its own: it cut one window per sign with the app's segmenter,
   classified it once, and judged it against the Counter's 78% threshold.
   The model was trained and tuned for something quite different —

     · a ROLLING window of the last 30 frames, not a cut one
     · classified every 3rd frame, not once per sign
     · accepted at 0.60, not 0.78
     · and only after the SAME word comes back twice in a row
     · with a one-second debounce against repeats

   — which is why it read far better on the bench than in the product.
   Every constant below is from config.py.
   ============================================================ */

export const SEQUENCE_LENGTH = 30
const INFERENCE_EVERY_N_FRAMES = 3
const CONFIDENCE_THRESHOLD = 0.6
const STABILITY_COUNT = 2
const DEBOUNCE_MS = 1000
const NO_PERSON_FRAMES_TO_IDLE = 5
const REST_MOTION_THRESHOLD = 0.015
const REST_FRAMES_TO_IDLE = 45

export type Scene = 'no-person' | 'at-rest' | 'listening' | 'signing'

export type EngineEvent =
  /** A word that passed confidence, stability and debounce. */
  | { type: 'accept'; word: string; conf: number }
  /** What the model said before the gates, for the operator's read. */
  | { type: 'candidate'; word: string; conf: number; stable: number }

/**
 * One signer's rolling state. Not shared: the buffer, the last emission and
 * the motion history all belong to a single stream.
 */
export class SanketEngine {
  private buf: Float32Array[] = []
  private prev: Float32Array | null = null
  private noPerson = 0
  private lowMotion = 0
  private frames = 0
  private recent: string[] = []
  private lastWord = ''
  private lastAt = 0
  private inflight = false

  scene: Scene = 'listening'
  /** How full the rolling window is, 0..1 — the meter on screen. */
  get fill() { return Math.min(1, this.buf.length / SEQUENCE_LENGTH) }

  reset() {
    this.buf = []
    this.prev = null
    this.noPerson = 0
    this.lowMotion = 0
    this.frames = 0
    this.recent = []
    this.lastWord = ''
    this.lastAt = 0
    this.scene = 'listening'
  }

  private clearWindow(scene: Scene) {
    this.buf = []
    this.recent = []
    this.scene = scene
  }

  /**
   * Feed one frame. Returns nothing directly — a classification is a round
   * trip to the service, so results arrive through `onEvent`.
   */
  push(frame: SignFrame, now: number, onEvent: (e: EngineEvent) => void) {
    const { vec, handsFound, personPresent } = frame

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

    /* 3 — hands are what make it a sign. Without them the window is stale
       and is thrown away rather than left to rot in the buffer. */
    if (!handsFound) {
      this.clearWindow('listening')
      return
    }

    this.scene = 'signing'
    this.buf.push(vec.slice())
    if (this.buf.length > SEQUENCE_LENGTH) this.buf.shift()
    this.frames += 1

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
        const best: SignPrediction | undefined = r?.top?.[0]
        if (!best) return
        this.gate(best, now, onEvent)
      })
      .finally(() => { this.inflight = false })
  }

  /** Confidence, then stability, then debounce — in that order. */
  private gate(best: SignPrediction, now: number, onEvent: (e: EngineEvent) => void) {
    if (best.conf < CONFIDENCE_THRESHOLD) {
      this.recent = []
      onEvent({ type: 'candidate', word: best.label, conf: best.conf, stable: 0 })
      return
    }

    this.recent.push(best.label)
    if (this.recent.length > STABILITY_COUNT) {
      this.recent = this.recent.slice(-STABILITY_COUNT)
    }

    onEvent({
      type: 'candidate',
      word: best.label,
      conf: best.conf,
      stable: this.recent.length,
    })

    if (this.recent.length < STABILITY_COUNT) return
    if (new Set(this.recent).size !== 1) return

    /* The same sign twice in a row is a repeat, not a re-read of the one
       just accepted. */
    if (best.label === this.lastWord && now - this.lastAt < DEBOUNCE_MS) return

    this.lastWord = best.label
    this.lastAt = now
    this.recent = []
    onEvent({ type: 'accept', word: best.label, conf: best.conf })
  }
}
