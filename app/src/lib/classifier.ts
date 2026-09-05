import type * as TF from '@tensorflow/tfjs'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import { SIGN_BY_ID } from './lexicon'
import { Framer } from './framing'

/* ============================================================
   classifier.ts — stage 04, for real.

   This is the Teachable Machine image model: MobileNetV2 over a
   224×224 crop, a 1280-wide embedding, and a softmax over the
   trained vocabulary. It replaces `confidenceFor()` in
   recognizer.ts, which invented a number.

   Three things about it are worth stating plainly, because they
   decide how the rest of the pipeline has to be built:

     · it reads ONE FRAME. It has no memory, so it cannot see
       movement. AGAIN and MORE differ by repetition; COME and GO
       differ by direction. A single frame cannot tell those apart
       on its own — which is why segmenter.ts only ever asks this
       model about the HOLD, the moment the hands have arrived and
       stopped, and averages its answer over that whole window.

     · it reads the WHOLE frame, background included. It was
       trained on whatever was behind the signer, so the crop at
       inference has to match the crop at training or the features
       land somewhere the model has never been.

     · it is a stopgap. The architecture in the brief is landmarks
       → BiGRU over a window, which sees movement by construction.
       This gets sign→text working tonight on the hardware that is
       actually in the room.

   The model is loaded from public/models/tm/ and is OPTIONAL. If
   it is not there the Counter falls back to the scripted read, so
   a missing file degrades the demo rather than breaking it.
   ============================================================ */

const BASE = `${import.meta.env.BASE_URL}models/tm/`.replace(/\/{2,}/g, '/')

/* Teachable Machine's training UI shows you a MIRRORED, SQUARE webcam and
   saves the samples the way you saw them. So the frame handed to the model
   here is mirrored and centre-cropped to match — anything else presents the
   model with a geometry it was never trained on, and every one-handed sign
   in the set is asymmetric enough for that to cost most of its accuracy.

   Both are overridable from the URL rather than only from source, because
   the moment to discover a preprocessing mismatch is while someone is
   standing at the counter and there is no time to edit and rebuild:

       ?mirror=0     feed the frame unmirrored
       ?crop=squash  stretch the full frame instead of cropping square

   Those two settings are exactly what Teachable Machine's own Python webcam
   snippet does, and that snippet disagrees with both its own image snippet
   and with how the trainer records. If accuracy is poor, try them. */
const params = new URLSearchParams(location.search)
const MIRROR = params.get('mirror') !== '0'
const SQUASH = params.get('crop') === 'squash'

/* Framed mode: crop to the signer's landmarks and mask the room out, via
   framing.ts — the same function recorder.html trains through.

   Off by default, because it is not a setting, it is a contract: a model
   trained on full frames must be fed full frames, and a model trained
   through the Framer must be fed through the Framer. Feeding one the other
   produces confident nonsense rather than an error. Turn it on with
   ?framing=1 once a model recorded through recorder.html is in place. */
export const FRAMING = params.get('framing') === '1'

export type TMMetadata = {
  labels: string[]
  imageSize?: number
  modelName?: string
}

export type Prediction = {
  /** lexicon gloss id, e.g. 'DOCTOR' — null when the label is not in the lexicon */
  gloss: string | null
  /** the raw Teachable Machine class name */
  label: string
  conf: number
}

/* A Teachable Machine class name is a human label ("Thank You"); the rest
   of this codebase keys everything off a lexicon id ("THANK-YOU"). One
   function owns that translation so a rename in the trainer cannot quietly
   desynchronise the gloss chips from the model's classes. */
export function labelToGloss(label: string): string | null {
  const id = label.trim().toUpperCase().replace(/[\s_]+/g, '-')
  return SIGN_BY_ID[id] ? id : null
}

/* Classes that mean "nothing is being signed". Adding one of these to the
   training set is the single cheapest accuracy win available: without it a
   softmax over 60 signs has to put its mass SOMEWHERE, so an empty counter
   reads as whichever sign the background happens to resemble. */
const NULL_LABELS = new Set(['background', 'none', 'nothing', 'rest', 'idle', 'neutral', 'blank'])
export const isNullLabel = (label: string) => NULL_LABELS.has(label.trim().toLowerCase())

export type LoadedModel = {
  labels: string[]
  imageSize: number
  /** softmax over `labels` for one video frame */
  predict(video: HTMLVideoElement, opts?: PreprocessOpts): Float32Array
  /** the 224×224 the model was last shown — what it actually sees */
  readonly canvas: HTMLCanvasElement
  /** true when the last predict was framed rather than a full frame */
  lastFramed: boolean
  dispose(): void
}

/* Overridable per call so a diagnostic can flip them live and still be
   exercising this exact code path rather than a copy of it. */
export type PreprocessOpts = {
  mirror?: boolean
  squash?: boolean
  /** force framed mode on or off for this call */
  framing?: boolean
  /** the tracker's output for this frame — required by framed mode */
  res?: HolisticLandmarkerResult | null
}
export const defaultPreprocess = () => ({ mirror: MIRROR, squash: SQUASH, framing: FRAMING })

let tfMod: typeof TF | null = null
async function tf(): Promise<typeof TF> {
  /* Deferred so the landing page never pays for a tensor library it does
     not use. The Counter pulls it in the moment the camera comes on. */
  if (!tfMod) tfMod = await import('@tensorflow/tfjs')
  return tfMod
}

/** True when a model has actually been exported into public/models/tm/. */
export async function modelPresent(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}model.json`, { method: 'GET', cache: 'no-store' })
    if (!res.ok) return false
    /* A dev server answers 404s with index.html, so an ok status is not
       enough — the body has to actually be a model graph. */
    const body = await res.json().catch(() => null)
    return !!body && (!!body.modelTopology || !!body.format)
  } catch {
    return false
  }
}

export async function loadModel(): Promise<LoadedModel> {
  const t = await tf()

  const [meta, model] = await Promise.all([
    fetch(`${BASE}metadata.json`).then(r => {
      if (!r.ok) throw new Error('metadata.json is missing from public/models/tm/')
      return r.json() as Promise<TMMetadata>
    }),
    t.loadLayersModel(`${BASE}model.json`),
  ])

  if (!Array.isArray(meta.labels) || !meta.labels.length) {
    throw new Error('metadata.json has no labels array')
  }

  const imageSize = meta.imageSize ?? 224

  /* One scratch canvas for the whole session. Allocating a canvas per frame
     at 30fps is how a page ends up garbage-collecting mid-sentence. */
  const scratch = document.createElement('canvas')
  scratch.width = imageSize
  scratch.height = imageSize
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!

  /* One Framer for the session, so its box smoothing is continuous rather
     than restarting on every frame. */
  const framer = new Framer(imageSize)
  /* Whichever surface the model was last shown, so a diagnostic can display
     the true input in either mode rather than always the full-frame one. */
  let lastCanvas = scratch

  /* TM normalises to [-1, 1] — MobileNet's own preprocessing. Feeding [0, 1]
     instead does not error, it just quietly halves accuracy. Both the framed
     and full-frame paths end here so they cannot diverge on it. */
  const runOn = (src: HTMLCanvasElement): Float32Array =>
    t.tidy(() => {
      const px = t.browser.fromPixels(src).toFloat().div(127.5).sub(1).expandDims(0)
      const out = model.predict(px) as TF.Tensor
      return out.dataSync() as Float32Array
    })

  /* Warm the graph up before anyone is standing at the counter. The first
     predict compiles shaders and costs 200–600ms; that cost must not land
     on the visitor's first sign. */
  t.tidy(() => {
    const warm = t.zeros([1, imageSize, imageSize, 3])
    const out = model.predict(warm) as TF.Tensor
    out.dataSync()
    out.dispose()
  })

  const loaded: LoadedModel = {
    labels: meta.labels,
    imageSize,

    get canvas() { return lastCanvas },
    lastFramed: false,

    predict(video: HTMLVideoElement, opts?: PreprocessOpts): Float32Array {
      const mirror = opts?.mirror ?? MIRROR
      const squash = opts?.squash ?? SQUASH
      const framing = opts?.framing ?? FRAMING

      /* Framed mode: framing.ts crops to the signer and masks the room, and
         the result is fed straight in. Both the recorder and this go through
         the same Framer, which is what keeps training and inference talking
         about the same picture. */
      if (framing) {
        const r = framer.draw(video, video.videoWidth, video.videoHeight, opts?.res ?? null)
        loaded.lastFramed = r.framed
        lastCanvas = framer.canvas
        /* No landmarks means no signer. The Framer hands back a flat field
           rather than the room, so the model has nothing to latch onto. */
        return runOn(framer.canvas)
      }
      loaded.lastFramed = false
      lastCanvas = scratch

      /* Centre square crop — ImageOps.fit((224, 224)) in the Python export,
         and what the trainer's own square webcam widget recorded. */
      const vw = video.videoWidth
      const vh = video.videoHeight
      const side = squash ? 0 : Math.min(vw, vh)
      const sw = squash ? vw : side
      const sh = squash ? vh : side
      const sx = (vw - sw) / 2
      const sy = (vh - sh) / 2

      sctx.save()
      if (mirror) {
        sctx.translate(imageSize, 0)
        sctx.scale(-1, 1)
      }
      sctx.drawImage(video, sx, sy, sw, sh, 0, 0, imageSize, imageSize)
      sctx.restore()

      return runOn(scratch)
    },

    dispose() {
      model.dispose()
    },
  }
  return loaded
}

/** argmax of a probability vector, as a Prediction. */
export function topOf(probs: Float32Array | number[], labels: string[]): Prediction {
  let best = 0
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i
  const label = labels[best] ?? `class ${best}`
  return { gloss: labelToGloss(label), label, conf: probs[best] }
}
