import { HAND_BONES, SK, handLandmarks, solveArm, type ResolvedFrame, type Vec } from './pose'

export const N_POSE = 33
export const N_HAND = 21
export const N_FACE = 468
export const N_TOTAL = N_POSE + N_HAND * 2 + N_FACE
export const OFF_POSE = 0
export const OFF_HAND_R = N_POSE
export const OFF_HAND_L = N_POSE + N_HAND
export const OFF_FACE = N_POSE + N_HAND * 2
export const G_POSE = 0, G_HAND = 1, G_FACE = 2, G_KEY = 3

export type Field = {
  positions: Float32Array
  groups: Float32Array
  seeds: Float32Array
  bones: Uint16Array
  faceLines: Uint16Array
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const FACE_BASE: { x: number; y: number; z: number; w: number }[] = (() => {
  const out: { x: number; y: number; z: number; w: number }[] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N_FACE; i++) {
    const t = i / (N_FACE - 1)
    let y = 1 - t * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = phi * i
    let x = Math.cos(th) * r
    let z = Math.sin(th) * r
    if (z < 0) { z = -z * 0.34; x *= 0.92 }
    out.push({ x: x * 0.86, y: y * 1.04, z: z * 0.78, w: hash(i * 3.7) })
  }
  return out
})()

export function buildField(): Field {
  const positions = new Float32Array(N_TOTAL * 3)
  const groups = new Float32Array(N_TOTAL)
  const seeds = new Float32Array(N_TOTAL)
  for (let i = 0; i < N_TOTAL; i++) {
    groups[i] = i < OFF_HAND_R ? G_POSE : i < OFF_FACE ? G_HAND : G_FACE
    seeds[i] = hash(i * 1.37)
  }

  for (const off of [OFF_HAND_R, OFF_HAND_L]) {
    for (const tip of [4, 8, 12, 16, 20]) groups[off + tip] = G_KEY
  }

  const bones: number[] = []
  const P = { nose: 0, shR: 12, shL: 11, elR: 14, elL: 13, wrR: 16, wrL: 15, hipR: 24, hipL: 23, neck: 1 }

  bones.push(
    P.shL, P.shR, P.shR, P.elR, P.elR, P.wrR, P.shL, P.elL, P.elL, P.wrL,
    P.neck, P.shL, P.neck, P.shR, P.nose, P.neck,

    P.shL, P.hipL, P.shR, P.hipR,
  )
  for (const off of [OFF_HAND_R, OFF_HAND_L]) {
    for (const [a, b] of HAND_BONES) bones.push(off + a, off + b)
  }

  const faceLines: number[] = []
  const ring = (from: number, count: number) => {
    for (let i = 0; i < count; i++) faceLines.push(OFF_FACE + from + i, OFF_FACE + from + ((i + 1) % count))
  }
  ring(0, 26)
  ring(30, 14)
  ring(50, 16)
  ring(74, 18)

  return {
    positions, groups, seeds,
    bones: new Uint16Array(bones),
    faceLines: new Uint16Array(faceLines),
  }
}

const WX = 1.9, WY = 1.9, CY = 0.27
const put = (p: Float32Array, i: number, x: number, y: number, z: number) => {
  p[i * 3] = x * WX
  p[i * 3 + 1] = -(y - CY) * WY
  p[i * 3 + 2] = z * WX
}

export function updateField(F: Field, f: ResolvedFrame, tMs: number) {
  const p = F.positions
  const lean = f.torso * 0.02
  const shR = { x: SK.shoulderR.x + lean, y: SK.shoulderR.y }
  const shL = { x: SK.shoulderL.x + lean, y: SK.shoulderL.y }
  const armR = solveArm(shR, f.R.pos, 'R')
  const armL = solveArm(shL, f.L.pos, 'L')
  const zR = (1 - armR.scale) * 0.30
  const zL = (1 - armL.scale) * 0.30
  const headC = { x: SK.nose.x + f.head * 0.013 + lean, y: SK.nose.y }
  const breathe = Math.sin(tMs / 2100) * 0.002
  put(p, 0, headC.x, SK.nose.y + breathe, 0.055)
  put(p, 1, headC.x, SK.chin.y - 0.012, 0.03)
  for (let i = 2; i <= 10; i++) {
    const a = (i - 2) / 9 * Math.PI * 2
    put(p, i, headC.x + Math.cos(a) * SK.headR * 0.7,
        SK.nose.y + Math.sin(a) * SK.headR * 0.8 + breathe, 0.03)
  }
  put(p, 11, shL.x, shL.y + breathe, 0.01)
  put(p, 12, shR.x, shR.y + breathe, 0.01)
  put(p, 13, armL.elbow.x, armL.elbow.y, zL * 0.45)
  put(p, 14, armR.elbow.x, armR.elbow.y, zR * 0.45)
  put(p, 15, armL.wrist.x, armL.wrist.y, zL)
  put(p, 16, armR.wrist.x, armR.wrist.y, zR)
  for (let i = 17; i <= 22; i++) {
    const src = i % 2 === 0 ? armR.wrist : armL.wrist
    put(p, i, src.x, src.y + 0.012, (i % 2 === 0 ? zR : zL))
  }
  put(p, 23, SK.waistL.x + lean * 0.4, SK.waistL.y, 0)
  put(p, 24, SK.waistR.x + lean * 0.4, SK.waistR.y, 0)

  const legY = [0.78, 0.78, 1.06, 1.06, 1.12, 1.12, 1.16, 1.16]
  for (let i = 25; i < N_POSE; i++) {
    const side = i % 2 === 0 ? 1 : -1
    put(p, i, side * SK.waistR.x * 0.92, legY[i - 25], side * 0.01)
  }

  const hand = (off: number, wrist: Vec, h: typeof f.R, side: 'R' | 'L', z: number) => {
    const a = handLandmarks(wrist, h.shape, h.palm, h.rot, side)
    let pts = a
    if (h.blend > 0.001 && h.shapeB !== h.shape) {
      const b = handLandmarks(wrist, h.shapeB, h.palm, h.rot, side)
      pts = a.map((q, i) => ({ x: q.x + (b[i].x - q.x) * h.blend, y: q.y + (b[i].y - q.y) * h.blend }))
    }
    for (let i = 0; i < N_HAND; i++) {
      const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20
      put(p, off + i, pts[i].x, pts[i].y, z + (tip ? 0.016 : i === 0 ? 0 : 0.008))
    }
  }
  hand(OFF_HAND_R, armR.wrist, f.R, 'R', zR)
  hand(OFF_HAND_L, armL.wrist, f.L, 'L', zL)

  const R = SK.headR
  const tilt = f.head * 0.2
  const ct = Math.cos(tilt), st = Math.sin(tilt)
  const browLift = f.brow * 0.010
  const browKnit = f.brow < 0 ? -f.brow : 0
  const jaw = Math.max(0, f.mouth) * 0.016
  const nod = f.nod * 0.006
  for (let i = 0; i < N_FACE; i++) {
    const b = FACE_BASE[i]
    let x = b.x * R * 0.86
    let y = b.y * R * 0.94
    let z = b.z * R * 1.06
    const yn = b.y

    if (yn > -0.52 && yn < -0.18) {
      y -= browLift
      x *= 1 - browKnit * 0.14
    }

    if (yn > -0.24 && yn < 0.06) y *= 1 - browKnit * 0.05

    if (yn > 0.30) { y += jaw * (yn - 0.30) * 2.6; x *= 1 + jaw * 0.5 }

    const rx = x * ct - y * st
    const ry = x * st + y * ct
    put(p, OFF_FACE + i, headC.x + rx, SK.nose.y + ry + nod + breathe, 0.03 + z)
  }
}
