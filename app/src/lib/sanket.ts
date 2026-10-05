import type { HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { SIGN_BY_ID } from './lexicon'
import { normalise, sanketSession, softmax } from './sanket-onnx'

/* ============================================================
   sanket.ts — the browser half of Sanket's own recogniser.

   A BiGRU with temporal attention over 30 frames of landmarks, trained on
   our own recorded corpus: 29 ISL signs, 175k parameters. It reads the
   MOVEMENT, not a still — which is why the window opens when the stroke
   starts rather than when the hand settles.

   It runs IN THE PAGE, as ONNX under onnxruntime-web — see sanket-onnx.ts
   for why, and for the parity check against the PyTorch checkpoint. So no
   landmarks cross the wire either: the camera, MediaPipe and the model are
   all on the signer's own machine, and the counter works with the network
   unplugged.

   The packing order below is the one the model was trained on. It is the
   one thing here that fails silently when wrong — a mis-ordered frame
   produces a confident answer rather than an error.
   ============================================================ */

export const HAND = 21
/** shoulders, elbows, wrists — MediaPipe pose indices, in training order. */
export const POSE_INDICES = [11, 12, 13, 14, 15, 16] as const

const HAND_COORDS = HAND * 3            // 63
const POSE_COORDS = POSE_INDICES.length * 3  // 18
export const FEATURE_DIM = HAND_COORDS * 2 + POSE_COORDS  // 144

const OFF_LEFT = 0
const OFF_RIGHT = HAND_COORDS
const OFF_POSE = HAND_COORDS * 2

/** The window the model reads, fixed at training time. */
export const SEQUENCE_LENGTH = 30
/** One sign is never this long; the cap bounds one request. */
export const MAX_FRAMES = 240
/** Below this the service refuses: resampling to 30 would be interpolation. */
export const MIN_FRAMES = 4

/* An absent hand is ZEROS, not NaN — the opposite of the PopSign bench next
   door. The training data zero-fills a hand it could not see, and the
   normaliser skips all-zero triplets so they stay absent rather than being
   pulled onto the shoulder midpoint. Writing NaN here would poison the
   whole frame instead. */
function writeHand(out: Float32Array, base: number, points: NormalizedLandmark[] | undefined) {
  for (let i = 0; i < HAND; i++) {
    const p = points?.[i]
    const o = base + i * 3
    out[o] = p ? p.x : 0
    out[o + 1] = p ? p.y : 0
    out[o + 2] = p ? (p.z ?? 0) : 0
  }
}

/** One Holistic result → 144 floats, written in place. */
export function packFrame(res: HolisticLandmarkerResult | null, out: Float32Array, frame: number) {
  const base = frame * FEATURE_DIM

  /* The swap is deliberate and it is how the model was trained: the
     extractor put MediaPipe's "Left" hand into the RIGHT slot and its
     "Right" into the LEFT. Holistic's leftHandLandmarks is that same
     "Left", so the slots cross here too. Straightening this out would
     mirror every sign the model has ever seen. */
  writeHand(out, base + OFF_RIGHT, res?.leftHandLandmarks?.[0])
  writeHand(out, base + OFF_LEFT, res?.rightHandLandmarks?.[0])

  const pose = res?.poseLandmarks?.[0]
  for (let i = 0; i < POSE_INDICES.length; i++) {
    const p = pose?.[POSE_INDICES[i]]
    const o = base + OFF_POSE + i * 3
    out[o] = p ? p.x : 0
    out[o + 1] = p ? p.y : 0
    out[o + 2] = p ? (p.z ?? 0) : 0
  }
}

/** Accumulates the frames of one sign, from the start of the stroke. */
export class SignBuffer {
  private buf = new Float32Array(MAX_FRAMES * FEATURE_DIM)
  private n = 0

  reset() { this.n = 0 }
  get frames() { return this.n }

  push(res: HolisticLandmarkerResult | null) {
    /* Past the cap the oldest frames go rather than the newest: a sign's
       meaning is in its end, and someone who dwells before moving should
       not push their own stroke out of the window. */
    if (this.n >= MAX_FRAMES) {
      this.buf.copyWithin(0, FEATURE_DIM)
      this.n = MAX_FRAMES - 1
    }
    packFrame(res, this.buf, this.n)
    this.n++
  }

  /** A copy, because the buffer keeps filling while the request is in flight. */
  take(): Float32Array {
    return this.buf.slice(0, this.n * FEATURE_DIM)
  }
}

/* The model's 29 classes are English words. Most land on a lexicon id by
   uppercasing and hyphenating; the rest are spelled out, because a silent
   miss costs a whole sign.

   Four have no sign in the lexicon yet — food, stop, goodbye and welcome's
   own entry — so they are read, shown, and reported as outside the
   vocabulary rather than mapped onto something that merely looks close. */
const ALIAS: Record<string, string> = {
  'how much': 'HOW-MANY',
  'i dont understand': 'NOT-UNDERSTAND',
  "i don't understand": 'NOT-UNDERSTAND',
  welcome: 'HELLO',

  /* Police pack — ready for when these classes are fine-tuned in (see
     Sanketv0.1/TRAINING_POLICE.md). The bare word already maps by the
     uppercasing rule, because POLICE / COMPLAINT / OFFICER / THEFT / STATION
     / LOST now exist as signs in the lexicon. These entries cover the
     synonyms and multi-word class names public ISL datasets tend to use, so
     whatever the trained label reads, it lands on the right gloss. */
  stolen: 'THEFT', steal: 'THEFT', robbery: 'THEFT', robbed: 'THEFT', snatched: 'THEFT',
  missing: 'LOST', 'lost item': 'LOST', misplaced: 'LOST',
  fir: 'COMPLAINT', complain: 'COMPLAINT', 'file complaint': 'COMPLAINT',
  grievance: 'COMPLAINT', 'report crime': 'COMPLAINT',
  inspector: 'OFFICER', 'police officer': 'OFFICER', sho: 'OFFICER', 'in charge': 'OFFICER',
  'police station': 'STATION', thana: 'STATION', chowki: 'STATION',
  constable: 'POLICE', cop: 'POLICE', havaldar: 'POLICE',
  mobile: 'PHONE', 'id card': 'CARD', aadhaar: 'CARD', aadhar: 'CARD',
}

export function sanketGloss(label: string): string | null {
  const key = label.trim().toLowerCase()
  const id = ALIAS[key] ?? key.toUpperCase().replace(/[\s_]+/g, '-')
  return SIGN_BY_ID[id] ? id : null
}

export type SignPrediction = { label: string; conf: number }
export type SignResult = { top: SignPrediction[]; ms: number; frames: number }
export type SignHealth = { ok: boolean; classes: number; dim: number; frames: number }

/** Loads the model. Answers the same shape the service used to answer. */
export async function signHealth(): Promise<SignHealth | null> {
  const session = await sanketSession()
  if (!session) return null
  return {
    ok: true,
    classes: session.classes.length,
    dim: FEATURE_DIM,
    frames: SEQUENCE_LENGTH,
  }
}

export async function signPredict(frames: Float32Array): Promise<SignResult | null> {
  if (frames.length < MIN_FRAMES * FEATURE_DIM) return null
  const session = await sanketSession()
  if (!session) return null

  const count = frames.length / FEATURE_DIM
  /* The engine hands over exactly one window. Anything else would have to
     be resampled, and the resampler lives in Python — see sanket-onnx.ts. */
  if (count !== SEQUENCE_LENGTH) return null

  const started = performance.now()
  try {
    /* A copy: normalise writes in place, and the caller's buffer is the
       engine's rolling window, which it is still filling. */
    const window = frames.slice()
    normalise(window, count)

    const probs = softmax(await session.run(window))

    const top = Array.from(probs, (conf, i) => ({ label: session.classes[i], conf }))
      .sort((a, b) => b.conf - a.conf)
      .slice(0, 3)

    return { top, ms: Math.round(performance.now() - started), frames: count }
  } catch {
    /* The counter must not stop because a recogniser did. */
    return null
  }
}
