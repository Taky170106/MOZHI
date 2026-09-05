import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { SK, type HandShape, type Palm, type ResolvedFrame } from './pose'
const JOINT_WEIGHT = [0.9, 1.05, 0.75]

const SHAPES: Record<HandShape, { curl: [number, number, number, number, number]; spread: number }> = {
  flat:  { curl: [0.15, 0.02, 0.02, 0.02, 0.02], spread: 0.15 },
  five:  { curl: [0.10, 0.00, 0.00, 0.00, 0.00], spread: 0.85 },
  fist:  { curl: [0.75, 0.95, 0.95, 0.95, 0.95], spread: 0.10 },
  point: { curl: [0.70, 0.00, 0.95, 0.95, 0.95], spread: 0.10 },
  v:     { curl: [0.70, 0.00, 0.00, 0.95, 0.95], spread: 0.30 },
  three: { curl: [0.10, 0.00, 0.00, 0.95, 0.95], spread: 0.60 },
  o:     { curl: [0.55, 0.60, 0.62, 0.62, 0.60], spread: 0.35 },
  c:     { curl: [0.35, 0.40, 0.42, 0.42, 0.40], spread: 0.45 },
  pinch: { curl: [0.62, 0.66, 0.30, 0.25, 0.20], spread: 0.30 },
  cup:   { curl: [0.30, 0.35, 0.35, 0.35, 0.35], spread: 0.40 },
  bent:  { curl: [0.25, 0.55, 0.55, 0.55, 0.55], spread: 0.20 },
  thumb: { curl: [0.00, 0.95, 0.95, 0.95, 0.95], spread: 0.75 },
  hook:  { curl: [0.60, 0.80, 0.80, 0.35, 0.30], spread: 0.20 },
  flatO: { curl: [0.50, 0.45, 0.45, 0.45, 0.45], spread: 0.25 },
  l:     { curl: [0.00, 0.00, 0.95, 0.95, 0.95], spread: 0.90 },
  y:     { curl: [0.00, 0.95, 0.95, 0.95, 0.00], spread: 0.85 },
  w:     { curl: [0.75, 0.00, 0.00, 0.00, 0.95], spread: 0.25 },
  relax: { curl: [0.20, 0.22, 0.25, 0.28, 0.30], spread: 0.25 },
}

const PALM_ROLL: Record<Palm, number> = {
  in: 0, out: Math.PI * 0.86, down: Math.PI * 0.46, up: -Math.PI * 0.46, side: Math.PI * 0.2,
}

const CURL_SIGN = -1
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'] as const
const THUMB_SEGMENTS = ['Metacarpal', 'Proximal', 'Distal'] as const
export type Rig = {
  scaleToVrm: number
  shoulderY: number
  armLen: { upper: number; lower: number }
  restDir: Record<'R' | 'L', THREE.Vector3>
}

export function measureVRM(v: VRM, camera?: THREE.PerspectiveCamera): Rig {
  const hum = v.humanoid
  const rig: Rig = {
    scaleToVrm: 1,
    shoulderY: 0,
    armLen: { upper: 0.26, lower: 0.24 },
    restDir: { R: new THREE.Vector3(-1, 0, 0), L: new THREE.Vector3(1, 0, 0) },
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

function solveArmIK(v: VRM, rig: Rig, side: 'R' | 'L', target: THREE.Vector3, roll: number) {
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
  hand.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side === 'R' ? -roll : roll)
}

function applyHand(v: VRM, side: 'R' | 'L', shape: HandShape, shapeB: HandShape, blend: number) {
  const hum = v.humanoid
  const A = SHAPES[shape] ?? SHAPES.relax
  const B = SHAPES[shapeB] ?? A
  const k = THREE.MathUtils.clamp(blend, 0, 1)
  const prefix = side === 'R' ? 'right' : 'left'
  const dir = (side === 'R' ? -1 : 1) * CURL_SIGN
  FINGERS.forEach((finger, fi) => {
    const curl = A.curl[fi] + (B.curl[fi] - A.curl[fi]) * k
    const segs = finger === 'Thumb' ? THUMB_SEGMENTS : SEGMENTS
    segs.forEach((seg, si) => {
      const node = hum.getNormalizedBoneNode(`${prefix}${finger}${seg}` as never)
      if (!node) return
      const bend = curl * 1.45 * JOINT_WEIGHT[si]
      if (finger === 'Thumb') {
        const spread = A.spread + (B.spread - A.spread) * k
        node.rotation.set(0, dir * spread * 0.5, dir * bend * 0.7)
      } else {
        node.rotation.set(0, 0, dir * bend)
      }
    })
  })
}

export function applyFrameToVRM(
  v: VRM, rig: Rig, f: ResolvedFrame, face: boolean, t = performance.now() / 1000, amp = 1,
) {
  const hum = v.humanoid
  solveArmIK(v, rig, 'R', toWorld(rig, f.R.pos).clone(), PALM_ROLL[f.R.palm] ?? 0)
  solveArmIK(v, rig, 'L', toWorld(rig, f.L.pos).clone(), PALM_ROLL[f.L.palm] ?? 0)
  applyHand(v, 'R', f.R.shape, f.R.shapeB, f.R.blend)
  applyHand(v, 'L', f.L.shape, f.L.shapeB, f.L.blend)

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
