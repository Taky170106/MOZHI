import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const asset = (p: string) => `${import.meta.env.BASE_URL}mediapipe/${p}`.replace(/\/{2,}/g, '/')

/* Letters and digits both: the corpus carries 0-9 alongside A-Z, and a
   counter that spells a name also has to spell a room number. */
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ...'0123456789'.split('')]

const SAMPLES = Number(new URLSearchParams(location.search).get('n') ?? 40)

type Vec3 = { x: number; y: number; z: number }

type HandFeature = {
  joints: number[]
  spread: number[]
  wrist: Vec3
  palmNormal: Vec3
  palmDir: Vec3
  span: number
  /* The 21 landmarks in MediaPipe's WORLD space: metres, origin at the hand's
     centre, and a depth the model actually estimated rather than the
     image-space approximation carried on the normalised landmarks. This is
     what a bone solver is built to read. */
  world: Vec3[]
}

type Sample = { count: number; right: HandFeature | null; left: HandFeature | null; rel: Vec3 | null; score: number }

const FINGERS: number[][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const angleBetween = (a: Vec3, b: Vec3) =>
  Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b)))))

function featuresFor(pts: Vec3[], world: Vec3[]): HandFeature | null {
  if (!pts || pts.length < 21) return null
  if (!world || world.length < 21) return null

  const wrist = pts[0]
  const span = len(sub(pts[9], wrist)) || 1

  /* Every angle is a joint bend, so the measurement is scale free: it does not
     matter how large the hand is in frame or how far away the signer stood. */
  const joints: number[] = []
  for (const chain of FINGERS) {
    const nodes = [wrist, ...chain.map(i => pts[i])]
    for (let i = 1; i < nodes.length - 1; i++) {
      const inward = sub(nodes[i - 1], nodes[i])
      const outward = sub(nodes[i + 1], nodes[i])
      joints.push(Math.PI - angleBetween(inward, outward))
    }
  }

  const palmNormal = norm(cross(sub(pts[5], wrist), sub(pts[17], wrist)))
  const palmDir = norm(sub(pts[9], wrist))

  const spread: number[] = []
  for (let i = 0; i < FINGERS.length - 1; i++) {
    spread.push(angleBetween(sub(pts[FINGERS[i][1]], wrist), sub(pts[FINGERS[i + 1][1]], wrist)))
  }

  return {
    joints,
    spread,
    wrist: { x: wrist.x, y: wrist.y, z: wrist.z },
    palmNormal,
    palmDir,
    span,
    world: world.map(p => ({ x: p.x, y: p.y, z: p.z })),
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const medianVec = (vs: Vec3[]): Vec3 => ({
  x: median(vs.map(v => v.x)),
  y: median(vs.map(v => v.y)),
  z: median(vs.map(v => v.z)),
})

/* Median absolute deviation, reported per letter so a pose assembled from
   frames that disagreed with each other cannot pass as a confident one. */
function spreadOf(hits: HandFeature[], med: number[]): number {
  const devs: number[] = []
  hits.forEach(h => h.joints.forEach((v, i) => devs.push(Math.abs(v - med[i]))))
  return median(devs)
}

function aggregate(list: (HandFeature | null)[]): (HandFeature & { n: number; mad: number }) | null {
  const hits = list.filter(Boolean) as HandFeature[]
  if (hits.length < 3) return null
  const n = hits[0].joints.length
  return {
    joints: Array.from({ length: n }, (_, i) => median(hits.map(h => h.joints[i]))),
    spread: Array.from({ length: hits[0].spread.length }, (_, i) => median(hits.map(h => h.spread[i]))),
    wrist: medianVec(hits.map(h => h.wrist)),
    palmNormal: norm(medianVec(hits.map(h => h.palmNormal))),
    palmDir: norm(medianVec(hits.map(h => h.palmDir))),
    span: median(hits.map(h => h.span)),
    /* Median landmark by landmark, so one frame where a finger was lost
       cannot drag the shape. */
    world: Array.from({ length: 21 }, (_, i) => medianVec(hits.map(h => h.world[i]))),
    n: hits.length,
    mad: 0,
  }
}

const log = (msg: string) => {
  const el = document.getElementById('log')!
  el.textContent += msg + '\n'
  el.scrollTop = el.scrollHeight
}
const setStatus = (msg: string) => { document.getElementById('status')!.textContent = msg }

/* createImageBitmap rather than <img>.decode(): decode() never settles in a
   background tab, and this page is meant to grind through thousands of
   images while nobody is looking at it. */
async function loadImage(src: string): Promise<ImageBitmap> {
  const blob = await fetch(src).then(r => r.blob())
  return createImageBitmap(blob)
}

export async function run() {
  setStatus('loading model…')
  const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))
  /* HandLandmarker, not Holistic. Holistic finds the body first and crops the
     hands out of it, so on a corpus of hands against a blank wall it detects
     nothing at all — measured at 3 usable frames out of 156. This model looks
     for hands directly. */
  const lm = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: asset('models/hand_landmarker.task'), delegate: 'GPU' },
    runningMode: 'IMAGE',
    numHands: 2,
    minHandDetectionConfidence: 0.25,
    minHandPresenceConfidence: 0.25,
    minTrackingConfidence: 0.25,
  })

  setStatus('reading corpus…')
  const manifest = await fetch('/corpus/manifest.json').then(r => r.json())
  const byId: Record<string, string[]> = {}
  for (const c of manifest.classes) byId[c.id] = c.files

  const out: Record<string, unknown> = {}
  const summary: { letter: string; two: number; one: number; none: number; used: number }[] = []

  for (const letter of LETTERS) {
    const files = byId[letter] ?? []
    if (!files.length) { log(`${letter}: no files`); continue }

    const step = Math.max(1, Math.floor(files.length / SAMPLES))
    const picked = files.filter((_, i) => i % step === 0).slice(0, SAMPLES)

    const samples: Sample[] = []
    let two = 0, one = 0, none = 0

    for (const f of picked) {
      let img: ImageBitmap
      try { img = await loadImage(`/corpus/img/${letter}/${f}`) } catch { continue }
      const res = lm.detect(img)
      img.close()

      /* Handedness is reported from the camera's point of view, and the corpus
         is not mirrored, so 'Left' here is the signer's left hand. */
      /* Image landmarks place the hand in frame; world landmarks describe its
         shape. Both are kept, indexed together, because handedness and the
         gap between the wrists are questions about the picture while the
         bones are a question about the hand. */
      let R: { img: Vec3[]; world: Vec3[] } | undefined
      let L: { img: Vec3[]; world: Vec3[] } | undefined
      ;(res.landmarks ?? []).forEach((pts, i) => {
        const world = (res.worldLandmarks ?? [])[i] as Vec3[] | undefined
        if (!world) return
        const pair = { img: pts as Vec3[], world }
        const label = res.handedness?.[i]?.[0]?.categoryName
        if (label === 'Right' && !R) R = pair
        else if (label === 'Left' && !L) L = pair
        else if (!R) R = pair
        else if (!L) L = pair
      })
      const k = (R ? 1 : 0) + (L ? 1 : 0)
      if (k === 2) two++; else if (k === 1) one++; else none++

      const right = R ? featuresFor(R.img, R.world) : null
      const left = L ? featuresFor(L.img, L.world) : null
      const rel = right && left
        ? {
            x: (right.wrist.x - left.wrist.x) / (left.span || 1),
            y: (right.wrist.y - left.wrist.y) / (left.span || 1),
            z: (right.wrist.z - left.wrist.z) / (left.span || 1),
          }
        : null
      const score = Math.max(0, ...(res.handedness ?? []).map(h => h[0]?.score ?? 0))
      if (right || left) samples.push({ count: k, right, left, rel, score })
    }

    /* A letter is one-handed or two-handed, never both, so the pose is built
       only from the frames that agree with the majority. Mixing them was
       averaging a genuine right hand together with frames where the right
       hand was never visible, which is how a pose ends up looking like
       neither of the two things it was measured from. */
    const hands: 1 | 2 = two > one ? 2 : 1
    const kept = samples.filter(s => s.count === hands)

    const R = aggregate(kept.map(s => s.right))
    const L = aggregate(kept.map(s => s.left))
    if (R) R.mad = spreadOf(kept.map(s => s.right).filter(Boolean) as HandFeature[], R.joints)
    if (L) L.mad = spreadOf(kept.map(s => s.left).filter(Boolean) as HandFeature[], L.joints)
    const rels = kept.map(s => s.rel).filter(Boolean) as Vec3[]

    /* Which hand a one-handed letter actually uses, by majority of the frames
       that survived, rather than by whichever the last frame happened to be. */
    const dominant = hands === 1
      ? (kept.filter(s => s.right).length >= kept.filter(s => s.left).length ? 'R' : 'L')
      : null

    out[letter] = {
      letter,
      images: picked.length,
      detected: { two, one, none },
      hands,
      kept: kept.length,
      dominant,
      handedness: median(kept.map(s => s.score)),
      right: R,
      left: L,
      relative: rels.length >= 3 ? medianVec(rels) : null,
    }
    summary.push({ letter, two, one, none, used: kept.length })
    const madTxt = R ? R.mad.toFixed(2) : (L ? L.mad.toFixed(2) : '—')
    log(`${letter}  ${hands}-hand  kept=${String(kept.length).padStart(3)}/${picked.length}  `
      + `(two=${two} one=${one} none=${none})  mad=${madTxt}${dominant ? '  ' + dominant : ''}`)
    setStatus(`${letter} — ${summary.length}/26`)
  }

  setStatus('writing…')
  const body = JSON.stringify({
    source: manifest.path,
    samplesPerLetter: SAMPLES,
    generated: new Date().toISOString(),
    letters: out,
  }, null, 2)
  const saved = await fetch('/corpus/result', { method: 'POST', body }).then(r => r.json())
  log(`\nwrote ${saved.file} (${saved.bytes} bytes)`)
  setStatus('done')
  ;(window as unknown as { RESULT: unknown }).RESULT = { summary, saved }
}

document.getElementById('go')!.addEventListener('click', () => {
  ;(document.getElementById('go') as HTMLButtonElement).disabled = true
  run().catch(e => { log('ERROR: ' + (e?.message ?? e)); setStatus('failed') })
})
