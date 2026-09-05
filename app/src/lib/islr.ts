import type { HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { SIGN_BY_ID } from './lexicon'

/* ============================================================
   islr.ts — the browser half of the PopSign ASL recogniser.

   The model is the 1st-place entry from Google's Isolated Sign
   Language Recognition competition: 250 ASL signs, and — unlike
   every image classifier — it reads a SEQUENCE of landmarks, so
   it sees movement. That is the right architecture. It is also
   American Sign Language, which is not what Sanket is for; this
   is a bench for testing the pipeline end to end, not the
   product's recogniser.

   It runs in server/islr.py because it cannot run here:
   tfjs-tflite loads the model and then aborts, its input tensor
   pinned to a single frame with no resize API in that runtime.

   What crosses the wire is landmarks, never pixels. The camera
   and MediaPipe stay in the browser exactly as they are; this
   packs the coordinates already being computed and posts them.

   The packing order is the competition's own, and it is the one
   thing here that fails silently when wrong — a mis-ordered
   frame produces a confident answer rather than an error.
   ============================================================ */

export const FACE = 468
export const HAND = 21
export const POSE = 33
export const LANDMARKS = FACE + HAND + POSE + HAND   // 543

/* face 0–467 · left_hand 468–488 · pose 489–521 · right_hand 522–542 */
const OFF_FACE = 0
const OFF_LHAND = FACE
const OFF_POSE = FACE + HAND
const OFF_RHAND = FACE + HAND + POSE

const FLOATS_PER_FRAME = LANDMARKS * 3

/** A sign is never longer than this; the cap bounds one request. */
export const MAX_FRAMES = 128

/* Absent landmarks are NaN in the training data, not zero. Zero is a real
   coordinate — the top-left corner — so filling with it tells the model the
   hand is at the edge of frame rather than out of it. */
function writeBlock(
  out: Float32Array,
  base: number,
  points: NormalizedLandmark[] | undefined,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const p = points?.[i]
    const o = (base + i) * 3
    if (p) {
      out[o] = p.x
      out[o + 1] = p.y
      out[o + 2] = p.z ?? 0
    } else {
      out[o] = NaN
      out[o + 1] = NaN
      out[o + 2] = NaN
    }
  }
}

/** One Holistic result → 543×3 floats, written in place. */
export function packFrame(res: HolisticLandmarkerResult | null, out: Float32Array, frame: number) {
  const base = frame * LANDMARKS
  /* tasks-vision returns 478 face points when iris refinement is on; the
     competition's 468 are the first of them, so the tail is dropped. */
  writeBlock(out, base + OFF_FACE, res?.faceLandmarks?.[0], FACE)
  writeBlock(out, base + OFF_LHAND, res?.leftHandLandmarks?.[0], HAND)
  writeBlock(out, base + OFF_POSE, res?.poseLandmarks?.[0], POSE)
  writeBlock(out, base + OFF_RHAND, res?.rightHandLandmarks?.[0], HAND)
}

/** Accumulates the frames of one sign, from the start of the stroke. */
export class LandmarkBuffer {
  private buf = new Float32Array(MAX_FRAMES * FLOATS_PER_FRAME)
  private n = 0

  reset() { this.n = 0 }
  get frames() { return this.n }

  push(res: HolisticLandmarkerResult | null) {
    /* Past the cap the oldest frames are dropped rather than the newest:
       a sign's meaning is in its end, and a visitor who dwells before
       moving should not push their own stroke out of the window. */
    if (this.n >= MAX_FRAMES) {
      this.buf.copyWithin(0, FLOATS_PER_FRAME)
      this.n = MAX_FRAMES - 1
    }
    packFrame(res, this.buf, this.n)
    this.n++
  }

  /** A copy, because the buffer keeps filling while the request is in flight. */
  take(): Float32Array {
    return this.buf.slice(0, this.n * FLOATS_PER_FRAME)
  }
}

/* PopSign writes its classes as single lowercase tokens. Most land on a
   lexicon id by uppercasing; the two that do not are spelled out here
   rather than guessed at, since a silent miss costs a whole sign.

   22 of the 250 reach Sanket's 60: HELLO THANK-YOU PLEASE YES NO MY WHERE
   WHY NOW TOMORROW YESTERDAY MORNING TIME WAIT HEAD SICK ROOM OPEN SEE GO
   BAD FINISH. The counter vocabulary — DOCTOR, APPOINTMENT, FORM,
   SIGNATURE, MEDICINE, PAIN — is not in the set at all. */
const ALIAS: Record<string, string> = {
  thankyou: 'THANK-YOU',
  minemy: 'MY',
}

export function islrGloss(label: string): string | null {
  const id = ALIAS[label.trim().toLowerCase()] ?? label.trim().toUpperCase().replace(/[\s_]+/g, '-')
  return SIGN_BY_ID[id] ? id : null
}

export type IslrPrediction = { label: string; conf: number }
export type IslrResult = { top: IslrPrediction[]; ms: number; frames: number }

export async function islrHealthy(): Promise<boolean> {
  try {
    const res = await fetch('/islr/health', { cache: 'no-store' })
    if (!res.ok) return false
    const body = await res.json().catch(() => null)
    return !!body?.ok
  } catch {
    return false
  }
}

export async function islrPredict(frames: Float32Array): Promise<IslrResult | null> {
  if (!frames.length) return null
  try {
    const res = await fetch('/islr/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      /* The view's own buffer, not the whole pool it may be a slice of. */
      body: frames.buffer.slice(frames.byteOffset, frames.byteOffset + frames.byteLength) as ArrayBuffer,
    })
    if (!res.ok) return null
    return (await res.json()) as IslrResult
  } catch {
    /* The counter must not stop because a recogniser did. */
    return null
  }
}
