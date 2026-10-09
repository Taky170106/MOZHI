import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { FEATURE_DIM, HAND, POSE_INDICES } from './sanket'
import { isHand, handSpan } from './hand'

/* ============================================================
   sanket-vision.ts — the landmarks the checkpoint was trained on.

   Not Holistic. The model's own README is explicit that the supplied
   MediaPipe assets and their landmark semantics are part of the contract:
   it was trained on the standalone Hand Landmarker and Pose Landmarker,
   and Holistic's hands come out of a different crop-and-track pipeline
   with different z values. Feeding Holistic's numbers to this checkpoint
   is the same class of mistake as reordering the vector — it answers
   confidently and wrongly, which is exactly what it was doing.

   Everything else here mirrors landmark_utils.py: two hands, one upper
   body, 0.5 across every threshold, VIDEO mode with a monotonically
   increasing timestamp, zeros for anything not seen.
   ============================================================ */

const asset = (p: string) => `${import.meta.env.BASE_URL}mediapipe/${p}`.replace(/\/{2,}/g, '/')

const HAND_COORDS = HAND * 3
const OFF_LEFT = 0
const OFF_RIGHT = HAND_COORDS
const OFF_POSE = HAND_COORDS * 2

export type SignFrame = {
  /** The 144 floats, in training order. */
  vec: Float32Array
  /** At least one hand was found — the reference engine gates on this. */
  handsFound: boolean
  /** An upper body was found. */
  personPresent: boolean
}

/** What MediaPipe returned this frame, BEFORE hand.ts had any say.

    A false positive is only localisable from two numbers side by side:
    what the detector claimed, and what the gate let through. If `raw` is
    0 while the screen reads a word, MediaPipe is not the culprit and no
    amount of threshold tuning will help. If `raw` is 1 with a span far
    below MIN_HAND_SPAN, the detector is inventing and the gate is the
    only thing standing between it and the model. */
export type VisionProbe = {
  raw: number
  accepted: number
  /** Span of each raw detection, as a fraction of the frame. */
  spans: number[]
  /** MediaPipe's handedness label for each raw detection. */
  labels: string[]
  /** Detections thrown away because a second one carried the same handedness
      label as the first: `numHands: 2` reporting one hand twice. Left in,
      both would have been written to the same half of the vector, so one
      half would hold the hand and the other zeros while `accepted` claimed
      two hands were up. */
  dupes: number
  pose: boolean
  /** The timestamp the detectors were given, so a reader can tell a live
      reading from a stale one. */
  stamp: number
}

export type SanketVision = {
  /* A canvas as well as a video: CameraField hands us a lift-corrected copy
     of the frame when the room is dim. Same dimensions as the video, so the
     normalised landmarks land in the same place either way. */
  detect: (video: HTMLVideoElement | HTMLCanvasElement, tMs: number) => SignFrame
  /** Shaped like a Holistic result so the segmenter and the drawn field,
      which both already speak that shape, keep working unchanged. */
  last: {
    poseLandmarks?: NormalizedLandmark[][]
    leftHandLandmarks?: NormalizedLandmark[][]
    rightHandLandmarks?: NormalizedLandmark[][]
  }
  /** The same frame as `last`, but before the shape gate — see VisionProbe.
      Mutated in place by `detect`; a diagnostic reads it, nothing else does. */
  probe: VisionProbe
  close: () => void
}

/** Which inference engine runs the landmarkers.

    CPU, not GPU — and that is not a preference, it is the reference.
    `landmark_utils.py` calls itself "the single source of truth for
    landmark extraction", exists to guarantee that "training-time and
    inference-time preprocessing are provably identical", and forces
    `Delegate.CPU` on both landmarkers while stating why: *"CPU-first is
    our hard requirement anyway."*

    The browser had `delegate: 'GPU'` on all six landmarkers, which is a
    different engine on a different numerical path — and a palm detector
    sitting near its threshold is precisely where a few ulps decide
    whether there is a hand in the frame at all. Every measurement taken
    of this pipeline was taken on CPU: no tracker latch across 60 frames
    at every threshold from 0.5 to 0.9, zero invented hands on empty
    scenes, 198 of 199 real frames kept with one flicker. Running the
    browser on GPU meant running an engine nobody had measured, against a
    checkpoint trained on the other one. */
export const VISION_DELEGATE = 'CPU' as const

export async function createSanketVision(): Promise<SanketVision> {
  const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))

  const [hands, pose] = await Promise.all([
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/hand_landmarker.task'), delegate: VISION_DELEGATE },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/pose_landmarker.task'), delegate: VISION_DELEGATE },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  ])

  const vec = new Float32Array(FEATURE_DIM)
  const last: SanketVision['last'] = {}
  const probe: VisionProbe = {
    raw: 0, accepted: 0, spans: [], labels: [], dupes: 0, pose: false, stamp: 0,
  }

  /* VIDEO mode wants a timestamp that only ever goes up, and the same one
     for both detectors so the two readings describe one moment. */
  let stamp = 0

  const writeHand = (base: number, points: NormalizedLandmark[] | undefined) => {
    for (let i = 0; i < HAND; i++) {
      const p = points?.[i]
      const o = base + i * 3
      vec[o] = p ? p.x : 0
      vec[o + 1] = p ? p.y : 0
      vec[o + 2] = p ? (p.z ?? 0) : 0
    }
  }

  const detect = (
    video: HTMLVideoElement | HTMLCanvasElement,
    tMs: number,
  ): SignFrame => {
    stamp = Math.max(stamp + 1, Math.round(tMs))

    let hr: HandLandmarkerResult | null = null
    let pr: PoseLandmarkerResult | null = null
    try {
      hr = hands.detectForVideo(video, stamp)
      pr = pose.detectForVideo(video, stamp)
    } catch {
      /* A dropped frame is not a reason to take the counter down. */
    }

    vec.fill(0)

    /* Handedness decides the slot, exactly as the extractor did: MediaPipe's
       "Left" goes to the canonical RIGHT hand. Straightening this out would
       mirror every sign the model has ever seen.

       A detection that fails the shape test in hand.ts is not written at
       all — not as zeros, not as a half-vector. Zeros are how the model is
       told "no hand here", and a latched blob deserves exactly that
       answer: handsFound stays false, the frame never enters the window,
       and the segmenter beside it sees no hand either. */
    let leftPoints: NormalizedLandmark[] | undefined
    let rightPoints: NormalizedLandmark[] | undefined
    let accepted = 0
    let dupes = 0
    probe.spans.length = 0
    probe.labels.length = 0
    if (hr?.landmarks) {
      hr.landmarks.forEach((points, i) => {
        /* Recorded whether or not it is accepted: the probe exists to show
           the detector's claim and the gate's verdict on the same line. */
        probe.spans.push(handSpan(points))
        probe.labels.push(hr!.handednesses?.[i]?.[0]?.categoryName ?? '?')
        if (!isHand(points)) return
        const label = hr!.handednesses?.[i]?.[0]?.categoryName
        const isLeft = label === 'Left'
        /* The same label twice means one hand reported as two. Writing the
           second would overwrite the first in the same half of the vector
           while counting two hands, so the model would read one hand and
           an empty slot and be told both were up. One hand is what it is. */
        if (isLeft ? leftPoints !== undefined : rightPoints !== undefined) {
          dupes += 1
          return
        }
        accepted += 1
        if (isLeft) {
          writeHand(OFF_RIGHT, points)
          leftPoints = points
        } else {
          writeHand(OFF_LEFT, points)
          rightPoints = points
        }
      })
    }
    const handsFound = accepted > 0
    probe.raw = probe.spans.length
    probe.accepted = accepted
    probe.dupes = dupes

    const body = pr?.landmarks?.[0]
    const personPresent = !!body
    if (body) {
      for (let i = 0; i < POSE_INDICES.length; i++) {
        const p = body[POSE_INDICES[i]]
        const o = OFF_POSE + i * 3
        vec[o] = p ? p.x : 0
        vec[o + 1] = p ? p.y : 0
        vec[o + 2] = p ? (p.z ?? 0) : 0
      }
    }

    /* The drawn field and the segmenter read this shape. Hands are named the
       way Holistic names them — by the image, not by the model's canonical
       slots — because that is what those two consumers expect. */
    last.poseLandmarks = body ? [body] : undefined
    last.leftHandLandmarks = leftPoints ? [leftPoints] : undefined
    last.rightHandLandmarks = rightPoints ? [rightPoints] : undefined

    probe.pose = personPresent
    probe.stamp = stamp

    return { vec, handsFound, personPresent }
  }

  return {
    detect,
    last,
    probe,
    close: () => {
      hands.close()
      pose.close()
    },
  }
}
