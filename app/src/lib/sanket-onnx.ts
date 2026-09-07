import * as ort from 'onnxruntime-web/wasm'

/* ============================================================
   sanket-onnx.ts — the recogniser, in the page.

   The checkpoint used to run in server/sign.py, and the browser posted it
   landmarks. That works on one machine and nowhere else: a PyTorch process
   cannot be deployed alongside a static site, and even where it can, this
   model classifies every third frame — over a network that is a round trip
   roughly ten times a second, which is felt.

   So the weights come here instead. The export is the same checkpoint, not
   a retrain: 175,389 parameters, verified against PyTorch at a maximum
   softmax difference of 3e-7 over random inputs, which is float32 rounding
   and nothing else.

   What runs here has to be the SAME arithmetic the model was trained on,
   so `normalise` below is a line-for-line port of normalize_sequence() in
   landmark_utils.py. The other half of that function, resample_sequence(),
   is deliberately absent: it interpolates a variable-length clip onto 30
   frames, and the live engine already hands over exactly 30. Porting an
   interpolation that can never run would be a second place for the two
   implementations to drift apart.
   ============================================================ */

/* Not imported from sanket.ts: that module imports this one, and a cycle
   between them would read these before they are initialised. They are the
   exported graph's own input shape — [1, 30, 144] is baked into the .onnx
   file — so this is the model's contract, not a second opinion about it. */
const SEQUENCE_LENGTH = 30
const FEATURE_DIM = 144
const POSE_OFFSET = 126   // both hands: 21 landmarks × 3 × 2
const LANDMARKS = 48      // 21 + 21 + 6

const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`.replace(/([^:])\/{2,}/g, '$1/')

/* One thread, no proxy worker. Threaded WASM needs SharedArrayBuffer, which
   needs cross-origin isolation, which would change how every other asset on
   this page is allowed to load — for a model that infers in under a
   millisecond on one core. */
ort.env.wasm.numThreads = 1
ort.env.wasm.proxy = false

/* Absolute, and it has to be. onnxruntime resolves a relative wasmPaths
   against ITS OWN module URL, not the document's — and its own module is a
   hashed chunk under /assets/, so a relative './ort/' looks for
   /assets/ort/ and the recogniser fails to start with nothing on screen to
   say why. Resolving against location.href here pins it to the site root.
   The hash route is dropped by URL resolution, so '#/counter' is fine. */
ort.env.wasm.wasmPaths = new URL(asset('ort/'), location.href).href

export type SanketSession = {
  classes: string[]
  run: (frames: Float32Array) => Promise<Float32Array>
}

let loading: Promise<SanketSession | null> | null = null

async function open(): Promise<SanketSession | null> {
  try {
    const [session, classes] = await Promise.all([
      ort.InferenceSession.create(asset('models/sanket/sanket-isl.onnx'), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
      fetch(asset('models/sanket/classes.json')).then(r => r.json() as Promise<string[]>),
    ])

    const input = session.inputNames[0]
    const output = session.outputNames[0]

    return {
      classes,
      run: async (frames: Float32Array) => {
        const tensor = new ort.Tensor('float32', frames, [1, SEQUENCE_LENGTH, FEATURE_DIM])
        const out = await session.run({ [input]: tensor })
        return out[output].data as Float32Array
      },
    }
  } catch {
    /* A recogniser that fails to load is a counter without one, not a
       broken page: live.ts falls through to the next backend. */
    return null
  }
}

/** Loaded once and shared. Repeated calls get the same session. */
export function sanketSession(): Promise<SanketSession | null> {
  loading ??= open()
  return loading
}

/**
 * normalize_sequence(), exactly: centre every landmark on the shoulder
 * midpoint and scale by shoulder width, so the model sees the same sign
 * whether the signer is near the camera or far from it, left of frame or
 * right of it.
 *
 * Written in place. The caller owns a copy already.
 */
export function normalise(seq: Float32Array, frames: number) {
  for (let t = 0; t < frames; t++) {
    const base = t * FEATURE_DIM
    const p = base + POSE_OFFSET

    const lx = seq[p], ly = seq[p + 1], lz = seq[p + 2]
    const rx = seq[p + 3], ry = seq[p + 4], rz = seq[p + 5]

    /* No shoulders means no pose was found, and there is nothing to
       normalise against — the frame stays as it is rather than being
       centred on the origin. */
    const noLeft = zero(lx) && zero(ly) && zero(lz)
    const noRight = zero(rx) && zero(ry) && zero(rz)
    if (noLeft && noRight) continue

    const mx = (lx + rx) / 2
    const my = (ly + ry) / 2
    const mz = (lz + rz) / 2

    /* Width is measured in the image plane only; z is a different scale
       and would make the divisor meaningless. */
    let width = Math.hypot(lx - rx, ly - ry)
    if (width < 1e-6) width = 1

    for (let j = 0; j < LANDMARKS; j++) {
      const o = base + j * 3
      const x = seq[o], y = seq[o + 1], z = seq[o + 2]
      /* Zero is how a missing hand is written, and it has to stay missing.
         Centring it would place a phantom hand on the signer's chest. */
      if (zero(x) && zero(y) && zero(z)) continue
      seq[o] = (x - mx) / width
      seq[o + 1] = (y - my) / width
      seq[o + 2] = (z - mz) / width
    }
  }
}

/** np.allclose(v, 0) — the tolerance numpy uses, so the two agree. */
const zero = (v: number) => Math.abs(v) <= 1e-8

/** Logits → probabilities, shifted by the max so exp() cannot overflow. */
export function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i]
  const out = new Float32Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - max)
    out[i] = e
    sum += e
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}
