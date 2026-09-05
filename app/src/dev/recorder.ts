import { FilesetResolver, HolisticLandmarker, type HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import { Framer } from '../lib/framing'
import { canvasToPng, makeZip, type ZipEntry } from './zip'

/* ============================================================
   recorder.ts — capture a training set the model can actually
   learn signs from.

   Teachable Machine's own webcam records the whole room, which
   is how a five-class model ends up answering DOCTOR to
   everything: the room is the strongest thing in the picture.
   This records through framing.ts instead — cropped to the
   signer's own landmarks, background masked out — so the only
   thing that varies between two classes is the hands.

   The images it writes are byte-for-byte what the Counter will
   feed the model at inference, because both go through the same
   Framer. That is the whole point, and it is also the one thing
   that must not be broken: a model trained on these and fed full
   frames will be confidently wrong.

   Workflow:
     · add the class names
     · hold RECORD (or the spacebar) to capture a burst
     · INTERLEAVE — a round of every class, then go round again.
       Recording 200 of one class and then 200 of the next lets
       the light, your position and your posture drift with the
       class label, and the model will learn the drift.
     · download one zip per class, unzip, and upload each folder
       to Teachable Machine as that class
   ============================================================ */

const $ = (id: string) => document.getElementById(id)!
const asset = (p: string) => `/mediapipe/${p}`.replace(/\/{2,}/g, '/')

const video = document.createElement('video')
video.playsInline = true
video.muted = true

const framer = new Framer(224)
const shots = new Map<string, Uint8Array<ArrayBuffer>[]>()
let classes: string[] = []
let active: string | null = null
let recording = false
let result: HolisticLandmarkerResult | null = null
let mask = true
let lastShot = 0

/** Captures per second while the button is held. */
const RATE = 8

const say = (s: string) => { $('status').textContent = s }

async function main() {
  say('loading the tracker…')
  const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))
  const landmarker = await HolisticLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: asset('models/holistic_landmarker.task'), delegate: 'GPU' },
    runningMode: 'VIDEO',
    /* The mask is the whole reason this page exists — it is what removes
       the room the model would otherwise memorise. */
    outputPoseSegmentationMasks: true,
  })

  say('asking for the camera…')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
  } catch (err) {
    say(`camera blocked: ${(err as DOMException).name}`)
    return
  }
  video.srcObject = stream
  await video.play()
  $('feed').appendChild(video)
  say('ready — add a class, then hold RECORD')

  let lastTime = -1
  const preview = $('preview') as HTMLCanvasElement
  const pctx = preview.getContext('2d')!

  const tick = (t: number) => {
    requestAnimationFrame(tick)
    if (video.readyState < 2) return
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime
      try { result = landmarker.detectForVideo(video, t) } catch { /* dropped frame */ }
    }

    const r = framer.draw(video, video.videoWidth, video.videoHeight, result, { mask })
    pctx.imageSmoothingEnabled = false
    pctx.drawImage(framer.canvas, 0, 0, preview.width, preview.height)

    $('framed').textContent = r.framed ? (r.masked ? 'framed + masked' : 'framed, no mask') : 'no person found'
    $('framed').className = r.framed ? 'good' : 'bad'

    /* A frame with no landmarks is not a sample of anything. Recording it
       would teach the model that a grey square is whichever sign was
       selected at the time. */
    if (recording && active && r.framed && t - lastShot > 1000 / RATE) {
      lastShot = t
      capture(active)
    }
  }
  requestAnimationFrame(tick)
}

async function capture(cls: string) {
  const png = await canvasToPng(framer.canvas)
  const list = shots.get(cls)
  if (!list) return
  list.push(png)
  renderClasses()
}

function renderClasses() {
  $('classes').innerHTML = classes
    .map(c => {
      const n = shots.get(c)?.length ?? 0
      const isActive = c === active
      return `<div class="cls${isActive ? ' active' : ''}" data-cls="${c}">
        <button class="pick" data-cls="${c}">${c}</button>
        <span class="count">${n}</span>
        <button class="dl" data-dl="${c}" ${n ? '' : 'disabled'}>zip</button>
        <button class="rm" data-rm="${c}">×</button>
      </div>`
    })
    .join('')

  const total = classes.reduce((a, c) => a + (shots.get(c)?.length ?? 0), 0)
  const counts = classes.map(c => shots.get(c)?.length ?? 0)
  const min = counts.length ? Math.min(...counts) : 0
  const max = counts.length ? Math.max(...counts) : 0
  $('total').textContent = `${total} images`
  /* Imbalance is the other way a five-class model collapses onto one
     answer, so it is shown rather than left to be discovered after
     training. */
  $('balance').textContent =
    counts.length > 1 && max > 0
      ? max > min * 1.6
        ? `unbalanced — ${min} vs ${max}, even them up`
        : `balanced (${min}–${max})`
      : ''
  $('balance').className = counts.length > 1 && max > min * 1.6 ? 'bad' : 'good'
}

$('classes').addEventListener('click', async e => {
  const el = e.target as HTMLElement
  const pick = el.dataset.cls
  const dl = el.dataset.dl
  const rm = el.dataset.rm
  if (pick) { active = pick; renderClasses() }
  if (rm) {
    classes = classes.filter(c => c !== rm)
    shots.delete(rm)
    if (active === rm) active = classes[0] ?? null
    renderClasses()
  }
  if (dl) {
    const list = shots.get(dl) ?? []
    if (!list.length) return
    const entries: ZipEntry[] = list.map((data, i) => ({
      name: `${dl}/${String(i + 1).padStart(4, '0')}.png`,
      data,
    }))
    const url = URL.createObjectURL(makeZip(entries))
    const a = document.createElement('a')
    a.href = url
    a.download = `${dl}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
})

$('add').addEventListener('click', () => {
  const input = $('name') as HTMLInputElement
  const name = input.value.trim()
  if (!name || classes.includes(name)) return
  classes.push(name)
  shots.set(name, [])
  active = active ?? name
  input.value = ''
  renderClasses()
})
;($('name') as HTMLInputElement).addEventListener('keydown', e => {
  if (e.key === 'Enter') ($('add') as HTMLButtonElement).click()
})

const rec = $('record') as HTMLButtonElement
const startRec = () => {
  if (!active) { say('pick a class first'); return }
  recording = true
  rec.classList.add('on')
  say(`recording ${active}…`)
}
const stopRec = () => {
  recording = false
  rec.classList.remove('on')
  say('ready')
}
rec.addEventListener('pointerdown', startRec)
window.addEventListener('pointerup', stopRec)
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); startRec() }
})
window.addEventListener('keyup', e => { if (e.code === 'Space') stopRec() })

$('mask').addEventListener('click', () => {
  mask = !mask
  ;($('mask') as HTMLButtonElement).textContent = `background: ${mask ? 'masked' : 'kept'}`
})
;($('mask') as HTMLButtonElement).textContent = `background: ${mask ? 'masked' : 'kept'}`

renderClasses()
main()
