import type { HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

/* ============================================================
   segmenter.ts — stage 03, for real.

   The problem this solves is the one that decides whether a
   single-frame classifier can read sign language at all.

   A camera delivers 30 frames a second. Most of them are not a
   sign: they are the hands travelling from the last sign to the
   next one, and a classifier asked about a transit frame will
   answer confidently and wrongly, because a hand halfway between
   two locations genuinely does look like a third sign.

   player.ts already states the phonology this depends on:

       preparation → stroke → HOLD → transition

   The hold is where the meaning is. So the rule here is simply
   the mirror of how the avatar renders: the hands move, the hands
   stop, and the stop is the sign. Nothing is classified during
   movement. Everything sampled during a hold is averaged, and the
   average is what gets committed.

   This is measured off the landmarks CameraField is already
   computing — the wrists, in normalised frame coordinates — so it
   costs one subtraction per frame and no extra model.
   ============================================================ */

export type SegState = 'idle' | 'moving' | 'hold'

/** Speed, in frame-widths per second, below which the hands count as still. */
const STILL_BELOW = 0.13
/** Speed above which a new stroke has begun and the hold is over. */
const MOVING_ABOVE = 0.30

/** A hold shorter than this is a hesitation, not a sign. */
const HOLD_MIN_MS = 200
/** A hold longer than this is someone standing there; commit and move on. */
const HOLD_MAX_MS = 1100
/** Hands away or still-but-at-rest for this long ends the utterance. */
const UTTERANCE_END_MS = 1500
/** Below this many sampled frames a hold has not been seen properly. */
const MIN_HOLD_FRAMES = 3

/* Motion is smoothed before it is compared to a threshold. Raw per-frame
   speed off MediaPipe is noisy enough to cross any single threshold several
   times inside one genuine hold, which would commit a sign three times. */
const SMOOTH = 0.55

export type SegEvent =
  /** a hold closed — these frames are the sign */
  | { type: 'hold'; frames: number; ms: number }
  /** the hands have been away or at rest long enough to end the sentence */
  | { type: 'end' }

export type SegTick = {
  state: SegState
  /** smoothed wrist speed in frame-widths/second — the meter on screen */
  energy: number
  handsVisible: boolean
  /** 0→1 through the current hold, for the progress bar */
  holdProgress: number
  event?: SegEvent
}

const wristOf = (
  hand: NormalizedLandmark[] | undefined,
  pose: NormalizedLandmark[] | undefined,
  poseIndex: number,
): NormalizedLandmark | null => hand?.[0] ?? pose?.[poseIndex] ?? null

export class Segmenter {
  private state: SegState = 'idle'
  private energy = 0
  private prevR: NormalizedLandmark | null = null
  private prevL: NormalizedLandmark | null = null
  private prevT = 0
  private holdStart = 0
  private holdFrames = 0
  private lastActivity = 0
  private committedSinceEnd = 0

  reset() {
    this.state = 'idle'
    this.energy = 0
    this.prevR = this.prevL = null
    this.prevT = 0
    this.holdStart = 0
    this.holdFrames = 0
    this.lastActivity = 0
    this.committedSinceEnd = 0
  }

  /** Called once per processed camera frame. `t` is performance.now(). */
  push(res: HolisticLandmarkerResult | null, t: number): SegTick {
    const pose = res?.poseLandmarks?.[0]
    const right = wristOf(res?.rightHandLandmarks?.[0], pose, 16)
    const left = wristOf(res?.leftHandLandmarks?.[0], pose, 15)

    /* Hands specifically, not the body. A visitor standing at the counter
       always has a pose; they are only signing when the hand landmarks
       resolve, which MediaPipe only does when a hand is actually up. */
    const handsVisible = !!(res?.rightHandLandmarks?.[0] || res?.leftHandLandmarks?.[0])

    const dt = this.prevT ? Math.max(1, t - this.prevT) / 1000 : 0
    let speed = 0
    if (dt > 0) {
      const d = (a: NormalizedLandmark | null, b: NormalizedLandmark | null) =>
        a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
      /* The faster hand governs. A one-handed sign leaves the other at rest,
         and averaging the two would halve every reading it produces. */
      speed = Math.max(d(right, this.prevR), d(left, this.prevL)) / dt
    }
    this.prevR = right
    this.prevL = left
    this.prevT = t

    this.energy = this.energy * SMOOTH + speed * (1 - SMOOTH)
    if (!this.lastActivity) this.lastActivity = t

    let event: SegEvent | undefined

    if (!handsVisible) {
      /* Hands gone. Anything mid-hold still counts if it was long enough —
         people do drop their hands straight out of the final sign. */
      if (this.state === 'hold') {
        const ms = t - this.holdStart
        if (ms >= HOLD_MIN_MS && this.holdFrames >= MIN_HOLD_FRAMES) {
          event = { type: 'hold', frames: this.holdFrames, ms }
          this.committedSinceEnd++
        }
      }
      this.state = 'idle'
      this.holdFrames = 0
    } else if (this.state === 'idle') {
      /* Deliberately does NOT touch lastActivity: hands up but still is
         exactly the state the end-of-utterance timer has to run through. */
      if (this.energy > MOVING_ABOVE) {
        this.state = 'moving'
        this.lastActivity = t
      }
    } else if (this.state === 'moving') {
      this.lastActivity = t
      if (this.energy < STILL_BELOW) {
        this.state = 'hold'
        this.holdStart = t
        this.holdFrames = 0
      }
    } else {
      /* hold */
      this.lastActivity = t
      this.holdFrames++
      const ms = t - this.holdStart
      const broke = this.energy > MOVING_ABOVE
      if (broke || ms >= HOLD_MAX_MS) {
        if (ms >= HOLD_MIN_MS && this.holdFrames >= MIN_HOLD_FRAMES) {
          event = { type: 'hold', frames: this.holdFrames, ms }
          this.committedSinceEnd++
        }
        /* After a commit the hands are either travelling to the next sign or
           parked. Either way the next sign needs its own stroke first, so go
           back through 'moving' rather than straight into another hold. */
        this.state = broke ? 'moving' : 'idle'
        this.holdFrames = 0
      }
    }

    /* End of utterance: the hands have been idle or gone for long enough and
       something was read. This is what hands the sentence to the glosser. */
    if (!event && this.committedSinceEnd > 0 && this.state === 'idle') {
      if (t - this.lastActivity > UTTERANCE_END_MS) {
        event = { type: 'end' }
        this.committedSinceEnd = 0
      }
    }

    return {
      state: this.state,
      energy: this.energy,
      handsVisible,
      holdProgress:
        this.state === 'hold' ? Math.min(1, (t - this.holdStart) / HOLD_MAX_MS) : 0,
      event,
    }
  }

  /** True while the current frame belongs to a hold and is worth classifying. */
  get sampling() {
    return this.state === 'hold'
  }
}
