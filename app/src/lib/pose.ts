export type Vec = { x: number; y: number }
export type HandShape =
  | 'flat' | 'five' | 'fist' | 'point' | 'v' | 'three'
  | 'o' | 'c' | 'pinch' | 'cup' | 'bent' | 'thumb'
  | 'hook' | 'flatO' | 'l' | 'y' | 'w' | 'relax'

export type Palm = 'in' | 'out' | 'down' | 'up' | 'side'
export type Loc =
  | 'rest' | 'neutral' | 'chest' | 'chestHigh' | 'shoulder' | 'neck'
  | 'chin' | 'mouth' | 'nose' | 'eye' | 'brow' | 'forehead'
  | 'temple' | 'ear' | 'cheek' | 'above' | 'abdomen'
  | 'side' | 'sideHigh' | 'across' | 'far' | 'centre'

export type HandPose = {
  loc: Loc

  dx?: number
  dy?: number
  shape: HandShape
  palm?: Palm

  rot?: number
}

export type Keyframe = {
  t: number
  R?: HandPose
  L?: HandPose

  brow?: number
  mouth?: number
  head?: number
  nod?: number
  torso?: number
}

export const SK = {
  headR: 0.072,
  nose: { x: 0.036, y: 0.11 },
  chin: { x: 0.044, y: 0.17 },
  neck: { x: 0.048, y: 0.194 },
  shoulderR: { x: 0.118, y: 0.202 },
  shoulderL: { x: -0.118, y: 0.202 },
  chest: { x: 0, y: 0.320 },
  waistR: { x: 0.076, y: 0.482 },
  waistL: { x: -0.076, y: 0.482 },
  upper: 0.148,
  fore: 0.142,
  handLen: 0.086,
}

const LOCS: Record<Loc, Vec> = {
  rest:      { x: 0.118, y: 0.508 },
  neutral:   { x: 0.100, y: 0.372 },
  chest:     { x: 0.065, y: 0.312 },
  chestHigh: { x: 0.062, y: 0.266 },
  shoulder:  { x: 0.118, y: 0.202 },
  neck:      { x: 0.048, y: 0.206 },
  chin:      { x: 0.044, y: 0.182 },
  mouth:     { x: 0.04, y: 0.148 },
  nose:      { x: 0.036, y: 0.118 },
  eye:       { x: 0.048, y: 0.086 },
  brow:      { x: 0.052, y: 0.066 },
  forehead:  { x: 0.044, y: 0.042 },
  temple:    { x: 0.086, y: 0.068 },
  ear:       { x: 0.09, y: 0.098 },
  cheek:     { x: 0.078, y: 0.126 },
  above:     { x: 0.042, y: -0.016 },
  abdomen:   { x: 0.068, y: 0.442 },
  side:      { x: 0.212, y: 0.382 },
  sideHigh:  { x: 0.206, y: 0.198 },
  across:    { x: -0.054, y: 0.300 },
  far:       { x: 0.116, y: 0.408 },
  centre:    { x: 0.013, y: 0.345 },
}

export function wristTarget(h: HandPose, side: 'R' | 'L'): Vec {
  const base = LOCS[h.loc]
  const m = side === 'R' ? 1 : -1
  return { x: m * (base.x + (h.dx ?? 0)), y: base.y + (h.dy ?? 0) }
}

export function solveArm(shoulder: Vec, wrist: Vec, side: 'R' | 'L') {
  const dx = wrist.x - shoulder.x
  const dy = wrist.y - shoulder.y
  let d = Math.max(1e-4, Math.hypot(dx, dy))
  const reach = SK.upper + SK.fore
  const k = Math.max(0.5, Math.min(1, d / (reach * 0.70)))
  const a = SK.upper * k, b = SK.fore * k
  const max = (a + b) * 0.985
  let w = wrist
  if (d > max) {
    const k = max / d
    w = { x: shoulder.x + dx * k, y: shoulder.y + dy * k }
    d = max
  }
  const ux = (w.x - shoulder.x) / d
  const uy = (w.y - shoulder.y) / d
  const cos = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)))
  const ang = Math.acos(cos)
  const at = (sgn: number): Vec => {
    const c = Math.cos(sgn * ang), si = Math.sin(sgn * ang)
    return { x: shoulder.x + (ux * c - uy * si) * a, y: shoulder.y + (ux * si + uy * c) * a }
  }
  const e1 = at(1), e2 = at(-1)
  const out = side === 'R' ? 1 : -1
  const outward = (e: Vec) => out * e.x
  let elbow: Vec
  if (w.y >= shoulder.y - 0.01) {
    const ok = [e1, e2].filter(e => e.y >= shoulder.y - 0.005)
    elbow = ok.length ? ok.reduce((m, e) => (outward(e) > outward(m) ? e : m))
      : (e1.y > e2.y ? e1 : e2)
  } else {
    elbow = outward(e1) * 0.6 + e1.y > outward(e2) * 0.6 + e2.y ? e1 : e2
  }

  const ceiling = shoulder.y - 0.05
  if (elbow.y < ceiling) {
    const ex = elbow.x - shoulder.x
    const ey = ceiling - shoulder.y
    const len = Math.hypot(ex, ey) || 1
    elbow = { x: shoulder.x + (ex / len) * a, y: shoulder.y + (ey / len) * a }
  }
  return { elbow, wrist: w, scale: k }
}

type FingerSpec = { spread: number; curl: number }
type ShapeSpec = {
  fingers: [FingerSpec, FingerSpec, FingerSpec, FingerSpec]
  thumb: { out: number; curl: number }

  pinch?: number
}

const SHAPES: Record<HandShape, ShapeSpec> = {
  flat:  { fingers: [{ spread: -5, curl: .04 }, { spread: -1, curl: .03 }, { spread: 3, curl: .05 }, { spread: 7, curl: .08 }], thumb: { out: 24, curl: .22 } },
  five:  { fingers: [{ spread: -18, curl: .06 }, { spread: -6, curl: .03 }, { spread: 7, curl: .05 }, { spread: 19, curl: .08 }], thumb: { out: 50, curl: .12 } },
  fist:  { fingers: [{ spread: -6, curl: .97 }, { spread: -1, curl: .97 }, { spread: 4, curl: .97 }, { spread: 9, curl: .97 }], thumb: { out: 34, curl: .72 } },
  point: { fingers: [{ spread: -6, curl: .02 }, { spread: -1, curl: .95 }, { spread: 4, curl: .95 }, { spread: 9, curl: .95 }], thumb: { out: 30, curl: .68 } },
  v:     { fingers: [{ spread: -19, curl: .03 }, { spread: 3, curl: .03 }, { spread: 6, curl: .95 }, { spread: 11, curl: .95 }], thumb: { out: 30, curl: .7 } },
  three: { fingers: [{ spread: -20, curl: .04 }, { spread: -3, curl: .04 }, { spread: 13, curl: .04 }, { spread: 11, curl: .95 }], thumb: { out: 32, curl: .7 } },
  w:     { fingers: [{ spread: -22, curl: .04 }, { spread: -2, curl: .04 }, { spread: 18, curl: .04 }, { spread: 12, curl: .96 }], thumb: { out: 24, curl: .8 } },
  o:     { fingers: [{ spread: -8, curl: .58 }, { spread: -2, curl: .58 }, { spread: 5, curl: .6 }, { spread: 12, curl: .62 }], thumb: { out: 44, curl: .5 }, pinch: .86 },
  flatO: { fingers: [{ spread: -6, curl: .42 }, { spread: -1, curl: .42 }, { spread: 4, curl: .44 }, { spread: 9, curl: .46 }], thumb: { out: 36, curl: .46 }, pinch: .92 },
  c:     { fingers: [{ spread: -7, curl: .42 }, { spread: -1, curl: .42 }, { spread: 5, curl: .44 }, { spread: 11, curl: .46 }], thumb: { out: 52, curl: .34 }, pinch: .3 },
  pinch: { fingers: [{ spread: -12, curl: .5 }, { spread: -2, curl: .06 }, { spread: 8, curl: .06 }, { spread: 20, curl: .08 }], thumb: { out: 40, curl: .5 }, pinch: .55 },
  cup:   { fingers: [{ spread: -20, curl: .5 }, { spread: -6, curl: .5 }, { spread: 8, curl: .52 }, { spread: 22, curl: .54 }], thumb: { out: 54, curl: .38 } },
  bent:  { fingers: [{ spread: -6, curl: .34 }, { spread: -1, curl: .34 }, { spread: 4, curl: .36 }, { spread: 9, curl: .38 }], thumb: { out: 24, curl: .3 } },
  thumb: { fingers: [{ spread: -6, curl: .96 }, { spread: -1, curl: .96 }, { spread: 4, curl: .96 }, { spread: 9, curl: .96 }], thumb: { out: 8, curl: .05 } },
  hook:  { fingers: [{ spread: -6, curl: .55 }, { spread: -1, curl: .95 }, { spread: 4, curl: .95 }, { spread: 9, curl: .95 }], thumb: { out: 30, curl: .74 } },
  l:     { fingers: [{ spread: -8, curl: .03 }, { spread: -1, curl: .95 }, { spread: 4, curl: .95 }, { spread: 9, curl: .95 }], thumb: { out: 78, curl: .04 } },
  relax: { fingers: [{ spread: -4, curl: .74 }, { spread: -1, curl: .78 }, { spread: 2, curl: .8 }, { spread: 5, curl: .82 }], thumb: { out: 20, curl: .62 } },
  y:     { fingers: [{ spread: -6, curl: .95 }, { spread: -1, curl: .95 }, { spread: 4, curl: .95 }, { spread: 26, curl: .04 }], thumb: { out: 74, curl: .05 } },
}

const F_LEN = [
  [0.26, 0.17, 0.13],
  [0.28, 0.19, 0.13],
  [0.25, 0.17, 0.12],
  [0.21, 0.14, 0.10],
]
const F_ROOT = [
  { x: -0.16, y: -0.31 },
  { x: -0.04, y: -0.34 },
  { x: 0.08, y: -0.32 },
  { x: 0.19, y: -0.28 },
]

function palmScale(palm: Palm): { sx: number; dim: number } {
  switch (palm) {
    case 'in':   return { sx: 0.94, dim: 0.0 }
    case 'out':  return { sx: 1.0, dim: 0.0 }
    case 'side': return { sx: 0.42, dim: 0.14 }
    case 'down': return { sx: 0.98, dim: 0.1 }
    case 'up':   return { sx: 0.98, dim: 0.06 }
  }
}

export function handLandmarks(
  wrist: Vec, shape: HandShape, palm: Palm, rotDeg: number, side: 'R' | 'L',
): Vec[] {
  const spec = SHAPES[shape]
  const S = SK.handLen
  const { sx } = palmScale(palm)
  const mirror = side === 'R' ? 1 : -1
  const base = (rotDeg * Math.PI) / 180 * mirror
  const cosB = Math.cos(base), sinB = Math.sin(base)
  const place = (lx: number, ly: number): Vec => {
    const px = lx * sx * mirror * S
    const py = ly * S
    return { x: wrist.x + px * cosB - py * sinB, y: wrist.y + px * sinB + py * cosB }
  }

  const pts: Vec[] = new Array(21)
  pts[0] = place(0, 0)

  const tOut = ((spec.thumb.out) * Math.PI) / 180
  const tCurl = spec.thumb.curl
  let tx = -0.30, ty = -0.10
  let ta = -Math.PI / 2 + tOut
  const tSeg = [0.20, 0.17, 0.14]
  const tPts: Vec[] = []
  for (let i = 0; i < 3; i++) {
    ta += tCurl * 0.62
    tx += Math.cos(ta) * tSeg[i]
    ty += Math.sin(ta) * tSeg[i]
    tPts.push({ x: tx, y: ty })
  }
  pts[1] = place(-0.24, -0.06)
  pts[2] = place(tPts[0].x, tPts[0].y)
  pts[3] = place(tPts[1].x, tPts[1].y)
  pts[4] = place(tPts[2].x, tPts[2].y)

  const thumbTip = { x: tPts[2].x, y: tPts[2].y }
  for (let f = 0; f < 4; f++) {
    const { spread, curl } = spec.fingers[f]
    const root = F_ROOT[f]
    const len = F_LEN[f]
    let a = -Math.PI / 2 + (spread * Math.PI) / 180
    let x = root.x, y = root.y
    const idx = 5 + f * 4
    pts[idx] = place(x, y)
    const seg: Vec[] = []
    for (let j = 0; j < 3; j++) {
      a += curl * (j === 0 ? 1.05 : 0.82)
      x += Math.cos(a) * len[j]
      y += Math.sin(a) * len[j]
      seg.push({ x, y })
    }
    if (spec.pinch) {
      const k = spec.pinch * (f === 0 ? 1 : 0.72)
      for (let j = 0; j < 3; j++) {
        const w = k * ((j + 1) / 3)
        seg[j] = { x: seg[j].x + (thumbTip.x - seg[j].x) * w, y: seg[j].y + (thumbTip.y - seg[j].y) * w }
      }
    }
    pts[idx + 1] = place(seg[0].x, seg[0].y)
    pts[idx + 2] = place(seg[1].x, seg[1].y)
    pts[idx + 3] = place(seg[2].x, seg[2].y)
  }
  return pts
}

export const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const REST_R: HandPose = { loc: 'rest', shape: 'relax', palm: 'in', rot: 172 }
const REST_L: HandPose = { loc: 'rest', shape: 'relax', palm: 'in', rot: 172 }
export const REST_FRAME: Required<Pick<Keyframe, 't'>> & Keyframe = {
  t: 0, R: REST_R, L: REST_L, brow: 0, mouth: 0, head: 0, nod: 0, torso: 0,
}

export type ResolvedHand = { pos: Vec; shape: HandShape; shapeB: HandShape; blend: number; palm: Palm; rot: number }
export type ResolvedFrame = {
  R: ResolvedHand; L: ResolvedHand
  brow: number; mouth: number; head: number; nod: number; torso: number
}

const ease = (t: number) => t * t * (3 - 2 * t)
function lerpHand(a: HandPose, b: HandPose, k: number, side: 'R' | 'L'): ResolvedHand {
  const pa = wristTarget(a, side)
  const pb = wristTarget(b, side)
  return {
    pos: { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k },
    shape: a.shape,
    shapeB: b.shape,
    blend: a.shape === b.shape ? 0 : k,
    palm: k < 0.5 ? (a.palm ?? 'in') : (b.palm ?? 'in'),
    rot: (a.rot ?? 0) + ((b.rot ?? 0) - (a.rot ?? 0)) * k,
  }
}

export function sampleTrack(frames: Keyframe[], u: number): ResolvedFrame {
  if (frames.length === 0) return sampleTrack([REST_FRAME], 0)
  const t = Math.min(1, Math.max(0, u))
  let i = 0
  while (i < frames.length - 1 && frames[i + 1].t <= t) i++
  const a = frames[i]
  const b = frames[Math.min(frames.length - 1, i + 1)]
  const span = Math.max(1e-6, b.t - a.t)
  const k = b === a ? 0 : ease(Math.min(1, Math.max(0, (t - a.t) / span)))
  const n = (v?: number) => v ?? 0
  return {
    R: lerpHand(a.R ?? REST_R, b.R ?? a.R ?? REST_R, k, 'R'),
    L: lerpHand(a.L ?? REST_L, b.L ?? a.L ?? REST_L, k, 'L'),
    brow: n(a.brow) + (n(b.brow) - n(a.brow)) * k,
    mouth: n(a.mouth) + (n(b.mouth) - n(a.mouth)) * k,
    head: n(a.head) + (n(b.head) - n(a.head)) * k,
    nod: n(a.nod) + (n(b.nod) - n(a.nod)) * k,
    torso: n(a.torso) + (n(b.torso) - n(a.torso)) * k,
  }
}

export function blendFrames(a: ResolvedFrame, b: ResolvedFrame, kRaw: number): ResolvedFrame {
  const k = ease(Math.min(1, Math.max(0, kRaw)))
  const h = (x: ResolvedHand, y: ResolvedHand): ResolvedHand => ({
    pos: { x: x.pos.x + (y.pos.x - x.pos.x) * k, y: x.pos.y + (y.pos.y - x.pos.y) * k },
    shape: x.blend > 0.5 ? x.shapeB : x.shape,
    shapeB: y.blend > 0.5 ? y.shapeB : y.shape,
    blend: k,
    palm: k < 0.5 ? x.palm : y.palm,
    rot: x.rot + (y.rot - x.rot) * k,
  })
  const m = (p: number, q: number) => p + (q - p) * k
  return {
    R: h(a.R, b.R), L: h(a.L, b.L),
    brow: m(a.brow, b.brow), mouth: m(a.mouth, b.mouth),
    head: m(a.head, b.head), nod: m(a.nod, b.nod), torso: m(a.torso, b.torso),
  }
}

export const restFrame = () => sampleTrack([REST_FRAME], 0)
export function posterT(frames: Keyframe[]): number {
  if (frames.length <= 1) return 1
  const cands = frames.filter(f => f.t > 0)
  if (!cands.length) return 1
  let best = cands[0]
  for (const f of cands) if (Math.abs(f.t - 0.72) < Math.abs(best.t - 0.72)) best = f
  return best.t
}
