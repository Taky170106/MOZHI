import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { SK, type FingerPoint, type HandShape, type Palm, type ResolvedFrame } from './pose'
const JOINT_WEIGHT = [0.9, 1.05, 0.75]
type Shape = {
  curl: [number, number, number, number, number]
  spread: number
  splay?: number
  fan?: [number, number, number, number, number]

  joints?: Record<number, [number, number, number]>
}

const FAN_OPEN: [number, number, number, number, number] = [0, 1, 0.34, -0.34, -1]
const SHAPES: Record<HandShape, Shape> = {
  flat:  { curl: [0.15, 0.02, 0.02, 0.02, 0.02], spread: 0.15, splay: 0.15 },
  five:  { curl: [0.10, 0.00, 0.00, 0.00, 0.00], spread: 0.85, splay: 1 },
  fist:  { curl: [0.75, 0.95, 0.95, 0.95, 0.95], spread: 0.10 },
  point: { curl: [0.70, 0.00, 0.95, 0.95, 0.95], spread: 0.10 },
  v:     { curl: [0.70, 0.00, 0.00, 0.95, 0.95], spread: 0.30, splay: 0.9 },
  three: { curl: [0.10, 0.00, 0.00, 0.95, 0.95], spread: 0.60, splay: 0.7 },

  o:     { curl: [0.78, 0.55, 0.57, 0.57, 0.55], spread: 0.48,
           joints: { 1: [0.58, 0.72, 0.46], 2: [0.58, 0.74, 0.46], 3: [0.56, 0.74, 0.46], 4: [0.54, 0.72, 0.46] } },

  c:     { curl: [0.26, 0.24, 0.26, 0.26, 0.24], spread: 0.80, splay: 0.25,
           joints: { 1: [0.24, 0.30, 0.20], 2: [0.24, 0.32, 0.20], 3: [0.24, 0.32, 0.20], 4: [0.22, 0.30, 0.20] } },
  pinch: { curl: [0.62, 0.66, 0.30, 0.25, 0.20], spread: 0.30 },
  cup:   { curl: [0.30, 0.35, 0.35, 0.35, 0.35], spread: 0.40, splay: 0.3 },
  bent:  { curl: [0.25, 0.55, 0.55, 0.55, 0.55], spread: 0.20 },
  thumb: { curl: [0.00, 0.95, 0.95, 0.95, 0.95], spread: 0.75 },
  hook:  { curl: [0.60, 0.80, 0.80, 0.35, 0.30], spread: 0.20 },
  flatO: { curl: [0.50, 0.45, 0.45, 0.45, 0.45], spread: 0.25 },
  l:     { curl: [0.00, 0.00, 0.95, 0.95, 0.95], spread: 0.95 },
  y:     { curl: [0.00, 0.95, 0.95, 0.95, 0.00], spread: 0.95 },
  w:     { curl: [0.80, 0.00, 0.00, 0.00, 0.95], spread: 0.20, splay: 0.75 },
  four:  { curl: [0.90, 0.00, 0.00, 0.00, 0.00], spread: 0.05, splay: 0.6 },
  six:   { curl: [0.70, 0.00, 0.00, 0.00, 0.85], spread: 0.50, splay: 0.5 },
  relax: { curl: [0.20, 0.22, 0.25, 0.28, 0.30], spread: 0.25, splay: 0.2 },

  aFist:   { curl: [0.05, 0.97, 0.97, 0.97, 0.97], spread: 0.30 },

  bFlat:   { curl: [0.92, 0.02, 0.02, 0.02, 0.02], spread: 0.00, splay: 0 },

  dPoint:  { curl: [0.50, 0.02, 0.82, 0.84, 0.86], spread: 0.28 },

  eClaw:   { curl: [0.85, 0.80, 0.80, 0.82, 0.82], spread: 0.05, splay: 0,
             joints: { 1: [0.95, 0.85, 0.45], 2: [0.95, 0.85, 0.45], 3: [0.95, 0.87, 0.45], 4: [0.95, 0.87, 0.45] } },

  fCircle: { curl: [0.62, 0.62, 0.02, 0.02, 0.03], spread: 0.55, splay: 0.5,
             joints: { 1: [0.72, 0.62, 0.35] } },

  gPoint:  { curl: [0.10, 0.02, 0.95, 0.95, 0.95], spread: 0.30 },

  hTwo:    { curl: [0.85, 0.02, 0.02, 0.95, 0.95], spread: 0.05, splay: 0 },

  iLittle: { curl: [0.88, 0.96, 0.96, 0.96, 0.00], spread: 0.10 },

  kV:      { curl: [0.10, 0.02, 0.02, 0.95, 0.95], spread: 0.62, splay: 0.75 },

  mThree:  { curl: [0.92, 0.82, 0.82, 0.82, 0.94], spread: 0.05, splay: 0 },
  nTwo:    { curl: [0.92, 0.82, 0.82, 0.94, 0.94], spread: 0.05, splay: 0 },

  rCross:  { curl: [0.85, 0.05, 0.05, 0.95, 0.95], spread: 0.05, splay: 0.85,
             fan: [0, -0.9, 0.9, 0, 0] },

  sFist:   { curl: [0.80, 0.97, 0.97, 0.97, 0.97], spread: 0.02 },

  tThumb:  { curl: [0.45, 0.90, 0.94, 0.94, 0.94], spread: 0.22 },

  uTwo:    { curl: [0.88, 0.02, 0.02, 0.95, 0.95], spread: 0.02, splay: 0 },

  xHook:   { curl: [0.82, 0.58, 0.96, 0.96, 0.96], spread: 0.12,
             joints: { 1: [0.20, 1.05, 0.85] } },
}

const PALM_NORMAL: Record<Palm, (side: 'R' | 'L') => THREE.Vector3> = {
  out:  () => new THREE.Vector3(0, 0, 1),
  in:   () => new THREE.Vector3(0, 0, -1),
  down: () => new THREE.Vector3(0, -1, 0),
  up:   () => new THREE.Vector3(0, 1, 0),
  side: s => new THREE.Vector3(s === 'R' ? 1 : -1, 0, 0),
}

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'] as const
const THUMB_SEGMENTS = ['Metacarpal', 'Proximal', 'Distal'] as const
type HandAxes = {
  curl: THREE.Vector3
  flex: THREE.Vector3
  abduct: THREE.Vector3

  splay: THREE.Vector3
}

export type Rig = {
  scaleToVrm: number
  shoulderY: number
  armLen: { upper: number; lower: number }
  restDir: Record<'R' | 'L', THREE.Vector3>
  hand: Record<'R' | 'L', HandAxes>
}

const DEFAULT_AXES = (side: 'R' | 'L'): HandAxes => ({
  curl: new THREE.Vector3(0, 0, side === 'R' ? 1 : -1),
  flex: new THREE.Vector3(0, -1, 0),
  abduct: new THREE.Vector3(side === 'R' ? 1 : -1, 0, 0),
  splay: new THREE.Vector3(0, side === 'R' ? 1 : -1, 0),
})

function measureHand(v: VRM, side: 'R' | 'L'): HandAxes {
  const hum = v.humanoid
  const p = (name: string) => {
    const node = hum.getNormalizedBoneNode(
      `${side === 'R' ? 'right' : 'left'}${name}` as never,
    )
    if (!node) return null
    const out = new THREE.Vector3()
    node.getWorldPosition(out)
    return out
  }

  const wrist = p('Hand')
  const middle = p('MiddleProximal')
  const index = p('IndexProximal')
  const little = p('LittleProximal')
  const thumbA = p('ThumbMetacarpal') ?? p('ThumbProximal')
  const thumbB = p('ThumbProximal') ?? p('ThumbDistal')
  if (!wrist || !middle || !index || !little || !thumbA || !thumbB) return DEFAULT_AXES(side)

  const fingerDir = middle.clone().sub(wrist).normalize()
  const across = index.clone().sub(little).normalize()
  const palm = new THREE.Vector3().crossVectors(across, fingerDir).normalize()
  if (palm.y > 0) palm.negate()

  const thumbDir = thumbB.clone().sub(thumbA).normalize()
  const toLittle = across.clone().negate()

  const curl = new THREE.Vector3().crossVectors(fingerDir, palm).normalize()
  const flex = new THREE.Vector3().crossVectors(thumbDir, toLittle)
  const abduct = new THREE.Vector3().crossVectors(thumbDir, palm)
  const splay = new THREE.Vector3().crossVectors(fingerDir, across)
  if (flex.lengthSq() < 1e-8 || abduct.lengthSq() < 1e-8 || splay.lengthSq() < 1e-8) {
    return DEFAULT_AXES(side)
  }

  return {
    curl,
    flex: flex.normalize(),
    abduct: abduct.normalize(),
    splay: splay.normalize(),
  }
}

export function measureVRM(v: VRM, camera?: THREE.PerspectiveCamera): Rig {
  const hum = v.humanoid
  const rig: Rig = {
    scaleToVrm: 1,
    shoulderY: 0,
    armLen: { upper: 0.26, lower: 0.24 },
    restDir: { R: new THREE.Vector3(-1, 0, 0), L: new THREE.Vector3(1, 0, 0) },
    hand: { R: DEFAULT_AXES('R'), L: DEFAULT_AXES('L') },
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const shoulder = hum.getNormalizedBoneNode('rightUpperArm')
  const elbow = hum.getNormalizedBoneNode('rightLowerArm')
  const wrist = hum.getNormalizedBoneNode('rightHand')
  const head = hum.getNormalizedBoneNode('head')
  if (!shoulder || !elbow || !wrist || !head) return rig

  v.scene.updateWorldMatrix(true, true)
  shoulder.getWorldPosition(a); elbow.getWorldPosition(b); wrist.getWorldPosition(c)
  rig.armLen = { upper: a.distanceTo(b), lower: b.distanceTo(c) }
  rig.shoulderY = a.y

  for (const side of ['R', 'L'] as const) {
    const up = hum.getNormalizedBoneNode(side === 'R' ? 'rightUpperArm' : 'leftUpperArm')
    const lo = hum.getNormalizedBoneNode(side === 'R' ? 'rightLowerArm' : 'leftLowerArm')
    if (!up || !lo) continue
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
    up.getWorldPosition(p0); lo.getWorldPosition(p1)
    const pq = new THREE.Quaternion()
    up.parent?.getWorldQuaternion(pq)
    rig.restDir[side] = p1.sub(p0).applyQuaternion(pq.invert()).normalize()
  }

  rig.scaleToVrm = (Math.abs(a.x) * 2) / (SK.shoulderR.x - SK.shoulderL.x)

  rig.hand = { R: measureHand(v, 'R'), L: measureHand(v, 'L') }

  if (camera) {
    const hp = new THREE.Vector3()
    head.getWorldPosition(hp)
    const centre = rig.shoulderY + (hp.y - rig.shoulderY) * 0.15
    camera.position.set(0, centre + 0.02, 2.25)
    camera.lookAt(0, centre, 0)
    camera.updateProjectionMatrix()
  }
  return rig
}

const tmpA = new THREE.Vector3()
function toWorld(rig: Rig, p: { x: number; y: number }) {
  return tmpA.set(
    -p.x * rig.scaleToVrm,
    rig.shoulderY - (p.y - SK.shoulderR.y) * rig.scaleToVrm,
    0.16,
  )
}

const restFingerDir = (side: 'R' | 'L') => new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0)
const REST_PALM = new THREE.Vector3(0, -1, 0)
function basis(forward: THREE.Vector3, up: THREE.Vector3) {
  const f = forward.clone().normalize()
  const u = up.clone().addScaledVector(f, -up.dot(f))
  if (u.lengthSq() < 1e-8) {
    u.set(0, 0, 1).addScaledVector(f, -f.z)
    if (u.lengthSq() < 1e-8) u.set(0, 1, 0).addScaledVector(f, -f.y)
  }
  u.normalize()
  const r = new THREE.Vector3().crossVectors(u, f).normalize()
  return new THREE.Matrix4().makeBasis(r, u, f)
}

const WRIST_BREAK: Record<FingerPoint, (side: 'R' | 'L') => THREE.Vector3> = {
  across: side => new THREE.Vector3(side === 'R' ? 1 : -1, 0.15, 0.25),
  down:   () => new THREE.Vector3(0, -1, 0.3),
}

const WRIST_LIMIT = 1.15
function orientHand(v: VRM, side: 'R' | 'L', palm: Palm, point?: FingerPoint) {
  const hum = v.humanoid
  const lower = hum.getNormalizedBoneNode(side === 'R' ? 'rightLowerArm' : 'leftLowerArm')
  const hand = hum.getNormalizedBoneNode(side === 'R' ? 'rightHand' : 'leftHand')
  if (!lower || !hand) return

  lower.updateWorldMatrix(true, true)
  const elbowP = new THREE.Vector3()
  const wristP = new THREE.Vector3()
  lower.getWorldPosition(elbowP)
  hand.getWorldPosition(wristP)
  const forearm = wristP.sub(elbowP)
  if (forearm.lengthSq() < 1e-8) return
  forearm.normalize()

  const wantPalm = (PALM_NORMAL[palm] ?? PALM_NORMAL.in)(side)
  const fingers = forearm.clone()
  const aim = point ? WRIST_BREAK[point](side).normalize() : null
  if (aim) {
    const angle = forearm.angleTo(aim)
    const axis = new THREE.Vector3().crossVectors(forearm, aim)
    if (axis.lengthSq() > 1e-8) {
      axis.normalize()
      fingers.applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(axis, Math.min(angle, WRIST_LIMIT)),
      )
      fingers.normalize()
    }
  }

  const target = basis(fingers, wantPalm)
  const rest = basis(restFingerDir(side), REST_PALM)
  const want = new THREE.Quaternion().setFromRotationMatrix(target)
    .multiply(new THREE.Quaternion().setFromRotationMatrix(rest).invert())

  const parentQ = new THREE.Quaternion()
  hand.parent?.getWorldQuaternion(parentQ)
  hand.quaternion.copy(parentQ.invert().multiply(want))
}

function solveArmIK(v: VRM, rig: Rig, side: 'R' | 'L', target: THREE.Vector3) {
  const hum = v.humanoid
  const upper = hum.getNormalizedBoneNode(side === 'R' ? 'rightUpperArm' : 'leftUpperArm')
  const lower = hum.getNormalizedBoneNode(side === 'R' ? 'rightLowerArm' : 'leftLowerArm')
  const hand = hum.getNormalizedBoneNode(side === 'R' ? 'rightHand' : 'leftHand')
  if (!upper || !lower || !hand) return

  upper.parent?.updateWorldMatrix(true, false)
  const origin = new THREE.Vector3()
  upper.getWorldPosition(origin)

  const parentQ = new THREE.Quaternion()
  upper.parent?.getWorldQuaternion(parentQ)

  const toLocal = target.clone().sub(origin).applyQuaternion(parentQ.clone().invert())
  const reach = (rig.armLen.upper + rig.armLen.lower) * 0.995
  const dist = Math.min(toLocal.length(), reach)
  if (dist < 1e-4) return
  const dir = toLocal.clone().normalize()
  const { upper: a, lower: b } = rig.armLen
  const elbow = Math.acos(THREE.MathUtils.clamp((a * a + b * b - dist * dist) / (2 * a * b), -1, 1))
  const lift = Math.acos(THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1))
  const pole = new THREE.Vector3(side === 'R' ? -0.35 : 0.35, -1, -0.55).normalize()
  const n = new THREE.Vector3().crossVectors(dir, pole)
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1)
  n.normalize()

  const upperDir = dir.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, lift))
  upper.quaternion.setFromUnitVectors(rig.restDir[side], upperDir)

  const nLocal = n.clone().applyQuaternion(upper.quaternion.clone().invert()).normalize()
  lower.quaternion.setFromAxisAngle(nLocal, -(Math.PI - elbow))
  hand.quaternion.identity()
}

const BONE_LIMIT = { flex: 1.75, twist: 0.55 }
function solveIsSane(bones: Record<string, [number, number, number]>) {
  const vals = Object.entries(bones)
  if (vals.length < 12) return false
  for (const [name, [x, y, z]] of vals) {
    if (![x, y, z].every(Number.isFinite)) return false
    if (Math.abs(z) > BONE_LIMIT.flex) return false
    const lateral = name.startsWith('thumb') ? BONE_LIMIT.flex : BONE_LIMIT.twist
    if (Math.abs(x) > lateral || Math.abs(y) > lateral) return false
  }
  return true
}

function applyMeasuredHand(
  v: VRM, side: 'R' | 'L', bones: Record<string, [number, number, number]>,
): boolean {
  if (!solveIsSane(bones)) return false
  const hum = v.humanoid
  const prefix = side === 'R' ? 'right' : 'left'
  for (const name of Object.keys(bones)) {
    const node = hum.getNormalizedBoneNode(
      `${prefix}${name[0].toUpperCase()}${name.slice(1)}` as never,
    )
    if (!node) continue
    const [x, y, z] = bones[name]
    node.rotation.set(x, y, z)
  }
  return true
}

const THUMB_WEIGHT = [0.85, 0.75, 0.5]
function applyHand(
  v: VRM, rig: Rig, side: 'R' | 'L', shape: HandShape, shapeB: HandShape, blend: number,
) {
  const hum = v.humanoid
  const A = SHAPES[shape] ?? SHAPES.relax
  const B = SHAPES[shapeB] ?? A
  const k = THREE.MathUtils.clamp(blend, 0, 1)
  const prefix = side === 'R' ? 'right' : 'left'
  const ax = rig.hand[side]
  const spread = A.spread + (B.spread - A.spread) * k
  const splay = (A.splay ?? 0) + ((B.splay ?? 0) - (A.splay ?? 0)) * k
  const fan = k < 0.5 ? A.fan ?? FAN_OPEN : B.fan ?? FAN_OPEN
  FINGERS.forEach((finger, fi) => {
    const curl = A.curl[fi] + (B.curl[fi] - A.curl[fi]) * k
    const thumb = finger === 'Thumb'
    const segs = thumb ? THUMB_SEGMENTS : SEGMENTS
    segs.forEach((seg, si) => {
      const node = hum.getNormalizedBoneNode(`${prefix}${finger}${seg}` as never)
      if (!node) return

      if (!thumb) {
        const per = (k < 0.5 ? A.joints : B.joints)?.[fi]
        const bend = per ? per[si] * 1.45 : curl * 1.45 * JOINT_WEIGHT[si]
        const q = new THREE.Quaternion().setFromAxisAngle(ax.curl, bend)
        if (si === 0 && splay) {
          q.premultiply(new THREE.Quaternion().setFromAxisAngle(ax.splay, splay * fan[fi] * 0.3))
        }
        node.quaternion.copy(q)
        return
      }

      const q = new THREE.Quaternion().setFromAxisAngle(ax.flex, curl * 1.15 * THUMB_WEIGHT[si])
      if (si === 0) {
        q.premultiply(
          new THREE.Quaternion().setFromAxisAngle(ax.abduct, (spread - 0.35) * 0.85),
        )
      }
      node.quaternion.copy(q)
    })
  })
}

export function applyFrameToVRM(
  v: VRM, rig: Rig, f: ResolvedFrame, face: boolean, t = performance.now() / 1000, amp = 1,
) {
  const hum = v.humanoid
  solveArmIK(v, rig, 'R', toWorld(rig, f.R.pos).clone())
  solveArmIK(v, rig, 'L', toWorld(rig, f.L.pos).clone())

  orientHand(v, 'R', f.R.palm, f.R.point)
  orientHand(v, 'L', f.L.palm, f.L.point)
  if (!(f.R.bones && applyMeasuredHand(v, 'R', f.R.bones)))
    applyHand(v, rig, 'R', f.R.shape, f.R.shapeB, f.R.blend)
  if (!(f.L.bones && applyMeasuredHand(v, 'L', f.L.bones)))
    applyHand(v, rig, 'L', f.L.shape, f.L.shapeB, f.L.blend)

  const breath = Math.sin(t * 1.5)
  const chest = hum.getNormalizedBoneNode('chest')
  const upperChest = hum.getNormalizedBoneNode('upperChest')
  if (chest) chest.rotation.x = breath * 0.022 * amp
  if (upperChest) upperChest.rotation.x = -breath * 0.014 * amp

  const head = hum.getNormalizedBoneNode('head')
  const neck = hum.getNormalizedBoneNode('neck')
  const spine = hum.getNormalizedBoneNode('spine')
  if (head) head.rotation.set(f.nod * 0.34 + breath * 0.012 * amp, f.head * 0.5, 0)
  if (neck) neck.rotation.set(f.nod * 0.18 - breath * 0.01 * amp, f.head * 0.25, 0)
  if (spine) spine.rotation.set(breath * 0.008 * amp, 0, f.torso * 0.012)

  const em = v.expressionManager
  if (em) {
    em.setValue('happy', face ? Math.max(0, f.brow) * 0.5 : 0)
    em.setValue('sad', face ? Math.max(0, -f.brow) * 0.6 : 0)
    em.setValue('surprised', face ? Math.max(0, f.brow) * 0.35 : 0)
    em.setValue('aa', face ? Math.max(0, f.mouth) * 0.6 : 0)
    const cycle = t % 4.4
    em.setValue('blink', amp && cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) : 0)
  }
}
