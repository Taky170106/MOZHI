import type { HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

/* ============================================================
   framing.ts — the one preprocessing both training and
   inference must agree on.

   The diagnosis this exists to fix: Teachable Machine fine-tunes
   MobileNet on the WHOLE frame, so with five classes recorded in
   one room the strongest signal in the image is the room — the
   wall, the light, the shirt, where the signer stood. The hands
   are a few hundred pixels of 50,000. The model learned the
   scene, and every sign came out as whichever class the scene
   most resembled.

   So the frame handed to the model is rebuilt here:

     1. CROP to a box measured from the signer's own landmarks —
        head, torso, arms, both hands. This removes most of the
        room, and it also removes scale and position: standing
        closer, or a step to the left, no longer changes the
        image the model sees. That alone is worth more than the
        masking below.

     2. MASK the background out using the pose segmentation the
        Holistic model already produces, and replace it with a
        flat grey. What is left is a person on a blank field, so
        there is no room left to memorise.

     3. FIX the orientation. Because the recorder and the
        classifier both come through this function, the whole
        mirrored-or-not question stops existing: whatever is
        recorded is what is inferred.

   THE RULE: training images and inference frames must come from
   this same function. A model trained on framed images and fed
   full frames will be confidently wrong, and vice versa. That is
   why the recorder and classifier.ts both call it rather than
   each doing their own crop.
   ============================================================ */

/** The flat ground the background is replaced with. Mid-grey sits at ~0 once
    TM's (x/127.5 - 1) normalisation is applied, so it contributes nothing. */
const BACKDROP = '#808080'

/** Padding around the measured box, as a fraction of its longest side. */
const PAD = 0.14

/* The box is smoothed across frames. An unsmoothed box jitters by a few
   pixels every frame, which scales and shifts the image the model sees and
   adds noise to every reading — and, at record time, would bake that noise
   into the training set. */
const SMOOTH = 0.72

/* How many consecutive frames without landmarks before the box is dropped —
   about half a second at 30fps. Long enough to ride out a dropped frame,
   short enough that a signer walking away stops being classified. */
const STALE_FRAMES = 15

export type Box = { x: number; y: number; w: number; h: number }

export type FrameResult = {
  /** true when landmarks were found and the crop is meaningful */
  framed: boolean
  /** true when the background was actually masked out */
  masked: boolean
  box: Box | null
}

/* Pose landmarks 0–24: head, shoulders, elbows, wrists, hips. Below 25 is
   legs, which no sign uses and which would drag the box down to the floor. */
const POSE_UPPER = 25

function collect(res: HolisticLandmarkerResult | null): NormalizedLandmark[] {
  if (!res) return []
  const pts: NormalizedLandmark[] = []
  const pose = res.poseLandmarks?.[0]
  if (pose) for (let i = 0; i < Math.min(POSE_UPPER, pose.length); i++) pts.push(pose[i])
  for (const hand of [res.leftHandLandmarks?.[0], res.rightHandLandmarks?.[0]]) {
    if (hand) for (const p of hand) pts.push(p)
  }
  return pts
}

/** A square box, in normalised coordinates, around whatever was found. */
export function measureBox(res: HolisticLandmarkerResult | null): Box | null {
  const pts = collect(res)
  if (pts.length < 8) return null

  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }

  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return null

  /* Square, because the model's input is square and letterboxing a
     rectangle would put bars into the training data. */
  const side = Math.max(w, h) * (1 + PAD * 2)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side }
}

export class Framer {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private maskCanvas: HTMLCanvasElement
  private maskCtx: CanvasRenderingContext2D
  private maskData: ImageData | null = null
  private box: Box | null = null
  private missing = 0

  constructor(readonly size = 224) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = size
    this.canvas.height = size
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.maskCanvas = document.createElement('canvas')
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true })!
  }

  /** Forget the smoothed box — call when the camera restarts. */
  reset() { this.box = null; this.missing = 0 }

  /**
   * Draw one framed, background-masked frame into `canvas`.
   * Returns what actually happened, so a caller can refuse to classify a
   * frame with no person in it rather than classifying the wallpaper.
   */
  draw(
    source: CanvasImageSource,
    sourceW: number,
    sourceH: number,
    res: HolisticLandmarkerResult | null,
    opts: { mask?: boolean } = {},
  ): FrameResult {
    const s = this.size
    const ctx = this.ctx

    const measured = measureBox(res)

    /* Tracking drops a frame here and there, and blanking the input every
       time it does would punch holes in a hold. So the last box is reused
       for a short grace period — but only a short one: past it the signer
       has actually left, and continuing to crop an empty room through a
       stale box would feed the model the wallpaper and let it answer. */
    if (measured) {
      this.missing = 0
    } else if (++this.missing > STALE_FRAMES) {
      this.box = null
    }

    if (measured) {
      /* Exponential smoothing on the box itself, not on the pixels. */
      this.box = this.box
        ? {
            x: this.box.x * SMOOTH + measured.x * (1 - SMOOTH),
            y: this.box.y * SMOOTH + measured.y * (1 - SMOOTH),
            w: this.box.w * SMOOTH + measured.w * (1 - SMOOTH),
            h: this.box.h * SMOOTH + measured.h * (1 - SMOOTH),
          }
        : measured
    }

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, s, s)

    const box = this.box
    if (!box) {
      /* No landmarks: a flat field, which the model reads as "nothing".
         Better than showing it the room and letting it answer anyway. */
      ctx.fillStyle = BACKDROP
      ctx.fillRect(0, 0, s, s)
      ctx.restore()
      return { framed: false, masked: false, box: null }
    }

    const sx = box.x * sourceW
    const sy = box.y * sourceH
    const sw = box.w * sourceW
    const sh = box.h * sourceH
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, s, s)

    let masked = false
    const mp = opts.mask === false ? null : res?.poseSegmentationMasks?.[0]
    if (mp) {
      try {
        masked = this.applyMask(mp, box)
      } catch {
        /* A mask that cannot be read is not worth losing the frame over. */
        masked = false
      }
    }

    ctx.restore()
    /* `framed` reports whether landmarks were found on THIS frame, so a
       caller can decline to commit a reading taken during a dropout even
       though the retained box kept the picture stable. */
    return { framed: !!measured, masked, box }
  }

  /** Keep only the person, then lay a flat grey behind them. */
  private applyMask(mp: { width: number; height: number; getAsFloat32Array(): Float32Array }, box: Box) {
    const mw = mp.width
    const mh = mp.height
    const conf = mp.getAsFloat32Array()
    if (!conf || conf.length < mw * mh) return false

    if (!this.maskData || this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
      this.maskCanvas.width = mw
      this.maskCanvas.height = mh
      this.maskData = this.maskCtx.createImageData(mw, mh)
    }
    const px = this.maskData!.data

    /* The mask goes into the alpha channel only; the colour is irrelevant
       because this canvas is used purely as a stencil. A soft edge is kept
       rather than a hard threshold, so hair and fingertips do not get a
       jagged cut that the model would learn as a feature. */
    for (let i = 0, j = 3; i < mw * mh; i++, j += 4) {
      const c = conf[i]
      px[j] = c > 0.85 ? 255 : c < 0.25 ? 0 : Math.round(((c - 0.25) / 0.6) * 255)
    }
    this.maskCtx.putImageData(this.maskData!, 0, 0)

    const ctx = this.ctx
    const s = this.size
    /* The mask is aligned to the full source image, so it is cropped with
       exactly the same box — otherwise the silhouette slides off the body. */
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(this.maskCanvas, box.x * mw, box.y * mh, box.w * mw, box.h * mh, 0, 0, s, s)

    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = BACKDROP
    ctx.fillRect(0, 0, s, s)

    ctx.globalCompositeOperation = 'source-over'
    return true
  }
}
