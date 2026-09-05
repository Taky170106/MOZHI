import { FilesetResolver, HolisticLandmarker, type HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import { loadModel, defaultPreprocess, type LoadedModel } from '../lib/classifier'

/* ============================================================
   model-debug.ts — what is the classifier actually looking at?

   "It says DOCTOR for everything" has several possible causes
   and they need different fixes, so guessing between them is a
   way to lose an evening:

     1. the crop is wrong — the hands are outside the 224×224 the
        model is shown, so every sign really does look the same
     2. the mirror is wrong — every one-handed sign arrives on the
        wrong side of the body
     3. the model keys on the background rather than the hands,
        which is what happens when five classes are recorded in
        one room in one sitting
     4. the model is fine and the segmenter commits at the wrong
        moment

   This page separates them. It shows the exact pixels handed to
   the model, live probabilities for every class, and toggles for
   framing, mirror and crop — and it calls the same predict() the
   Counter calls, so anything seen here is true of the product.

   The segmenter is deliberately not involved: this is the
   classifier alone, per frame.
   ============================================================ */

const $ = (id: string) => document.getElementById(id)!
const asset = (p: string) => `/mediapipe/${p}`.replace(/\/{2,}/g, '/')

const video = document.createElement('video')
video.playsInline = true
video.muted = true

let model: LoadedModel | null = null
let landmarker: HolisticLandmarker | null = null
let result: HolisticLandmarkerResult | null = null
let lastTime = -1

let mirror = defaultPreprocess().mirror
let squash = defaultPreprocess().squash
let framing = defaultPreprocess().framing
let frozen = false

/* A per-class rolling mean, so a class that is always high is visible as
   such rather than being lost in per-frame flicker. */
const HISTORY = 45
let history: number[][] = []

const setStatus = (s: string) => { $('status').textContent = s }

async function start() {
  setStatus('loading model…')
  try {
    model = await loadModel()
  } catch (err) {
    setStatus(`model failed to load: ${(err as Error).message}`)
    return
  }

  /* The tracker runs here too, because framed mode needs the landmarks and
     the segmentation mask. Without it the framing toggle would do nothing. */
  setStatus('loading the tracker…')
  try {
    const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))
    landmarker = await HolisticLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/holistic_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputPoseSegmentationMasks: true,
    })
  } catch (err) {
    setStatus(`tracker failed: ${(err as Error).message} — framing will not work`)
  }

  setStatus('asking for the camera…')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
  } catch (err) {
    setStatus(`camera blocked: ${(err as DOMException).name}`)
    return
  }
  video.srcObject = stream
  await video.play()
  $('feed').appendChild(video)

  buildBars(model.labels)
  setStatus(`${model.labels.length} classes · ${model.imageSize}×${model.imageSize} · running`)
  requestAnimationFrame(tick)
}

function buildBars(labels: string[]) {
  $('bars').innerHTML = labels
    .map(
      (l, i) => `
      <div class="row">
        <span class="name">${l}</span>
        <span class="track"><span class="fill" id="fill-${i}"></span></span>
        <span class="pct" id="pct-${i}">—</span>
        <span class="avg" id="avg-${i}"></span>
      </div>`,
    )
    .join('')
}

let last = 0
function tick(t: number) {
  requestAnimationFrame(tick)
  if (!model || frozen || video.readyState < 2) return
  /* ~20fps is plenty to read, and leaves the machine alone. */
  if (t - last < 50) return
  last = t

  if (landmarker && video.currentTime !== lastTime) {
    lastTime = video.currentTime
    try { result = landmarker.detectForVideo(video, t) } catch { /* dropped frame */ }
  }

  const probs = model.predict(video, { mirror, squash, framing, res: result })

  /* The very pixels the model was given, blown up. If the hands are not in
     this square, no amount of retraining will help. */
  const view = $('crop') as HTMLCanvasElement
  const vctx = view.getContext('2d')!
  vctx.imageSmoothingEnabled = false
  vctx.drawImage(model.canvas, 0, 0, view.width, view.height)

  history.push(Array.from(probs))
  if (history.length > HISTORY) history.shift()

  let top = 0
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i

  for (let i = 0; i < probs.length; i++) {
    const p = probs[i]
    const mean = history.reduce((a, h) => a + h[i], 0) / history.length
    const fill = $(`fill-${i}`)
    fill.style.width = `${p * 100}%`
    fill.className = `fill${i === top ? ' hot' : ''}`
    $(`pct-${i}`).textContent = `${(p * 100).toFixed(1)}%`
    $(`avg-${i}`).textContent = `avg ${(mean * 100).toFixed(0)}%`
  }

  $('top').textContent = `${model.labels[top]}  ${(probs[top] * 100).toFixed(1)}%`

  /* Spread is the diagnosis in one number. Near zero means the model cannot
     tell these frames apart at all — a training problem, not a threshold to
     tune. */
  const spread = Math.max(...probs) - Math.min(...probs)
  $('spread').textContent = `spread ${spread.toFixed(3)}${framing ? (model.lastFramed ? ' · framed' : ' · NO PERSON') : ''}`
}

const label = (id: string, text: string) => { ($(id) as HTMLButtonElement).textContent = text }
const framingLabel = () => label('framing', `framing: ${framing ? 'on (cropped + masked)' : 'off (full frame)'}`)
const mirrorLabel = () => label('mirror', `mirror: ${mirror ? 'on' : 'off'}`)
const cropLabel = () => label('crop-mode', `crop: ${squash ? 'squash' : 'square'}`)

$('framing').addEventListener('click', () => { framing = !framing; history = []; framingLabel() })
$('mirror').addEventListener('click', () => { mirror = !mirror; history = []; mirrorLabel() })
$('crop-mode').addEventListener('click', () => { squash = !squash; history = []; cropLabel() })
$('freeze').addEventListener('click', () => {
  frozen = !frozen
  label('freeze', frozen ? 'resume' : 'freeze')
})
$('reset').addEventListener('click', () => { history = [] })

framingLabel()
mirrorLabel()
cropLabel()

start()
