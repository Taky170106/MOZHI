import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { FEATURE_DIM, HAND, POSE_INDICES } from './sanket'

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

export type SanketVision = {
  detect: (video: HTMLVideoElement, tMs: number) => SignFrame
  /** Shaped like a Holistic result so the segmenter and the drawn field,
      which both already speak that shape, keep working unchanged. */
  last: {
    poseLandmarks?: NormalizedLandmark[][]
    leftHandLandmarks?: NormalizedLandmark[][]
    rightHandLandmarks?: NormalizedLandmark[][]
  }
  close: () => void
}

export async function createSanketVision(): Promise<SanketVision> {
  const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))

  const [hands, pose] = await Promise.all([
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/hand_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/pose_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  ])

  const vec = new Float32Array(FEATURE_DIM)
  const last: SanketVision['last'] = {}

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

  const detect = (video: HTMLVideoElement, tMs: number): SignFrame => {
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
       mirror every sign the model has ever seen. */
    let leftPoints: NormalizedLandmark[] | undefined
    let rightPoints: NormalizedLandmark[] | undefined
    const handsFound = !!hr?.landmarks?.length
    if (hr?.landmarks) {
      hr.landmarks.forEach((points, i) => {
        const label = hr!.handednesses?.[i]?.[0]?.categoryName
        if (label === 'Left') {
          writeHand(OFF_RIGHT, points)
          leftPoints = points
        } else {
          writeHand(OFF_LEFT, points)
          rightPoints = points
        }
      })
    }

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

    return { vec, handsFound, personPresent }
  }

  return {
    detect,
    last,
    close: () => {
      hands.close()
      pose.close()
    },
  }
}
