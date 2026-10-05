import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { LETTERS } from '@/lib/alphabet'
import { SIGN_BY_ID } from '@/lib/lexicon'
import { sampleTrack, type HandShape, type ResolvedFrame } from '@/lib/pose'
import { applyFrameToVRM, measureVRM, type Rig } from '@/lib/retarget'

/* ============================================================
   rig-check — a bench for the fingerspelling hand, and nothing else.

   The Counter plays a letter for 420ms at the size of a thumbnail, which is
   the worst possible place to judge whether a handshape is right. This page
   holds ONE pose, still, with the camera on the hand, so a shape can be
   compared against a reference and corrected.

   It is a development page: not routed, not in the nav, not built into the
   product bundle.
   ============================================================ */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const stage = $('stage')
const readout = $<HTMLPreElement>('readout')
const rail = $('rail')
const shapeRail = $('shapes')
const signRail = $('signs')

const SHAPE_NAMES: HandShape[] = [
  'flat', 'five', 'fist', 'point', 'v', 'three', 'o', 'c', 'pinch', 'cup', 'bent',
  'thumb', 'hook', 'flatO', 'l', 'y', 'w', 'four', 'six', 'relax',
  'aFist', 'bFlat', 'dPoint', 'eClaw', 'fCircle', 'gPoint', 'hTwo', 'kV',
  'mThree', 'nTwo', 'rCross', 'tThumb', 'uTwo',
]

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40)
/* preserveDrawingBuffer so the contact sheet can copy each render out. */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, devicePixelRatio))
renderer.setSize(430, 430, false)
renderer.setClearColor(0x111111, 1)
stage.appendChild(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 1.6))
const key = new THREE.DirectionalLight(0xffffff, 2.2)
key.position.set(0.8, 1.4, 1.6)
scene.add(key)

let vrm: VRM | null = null
let rig: Rig | null = null
let frame: ResolvedFrame = sampleTrack(LETTERS[0].frames, 0.75)
type View = 'hand' | 'bust' | 'body'
let view: View = 'hand'

const loader = new GLTFLoader()
loader.register(p => new VRMLoaderPlugin(p))

const url = new URLSearchParams(location.search).get('vrm') ?? './avatar/mozhi-avatar.vrm'

loader.loadAsync(url).then(gltf => {
  const v = gltf.userData.vrm as VRM
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  v.scene.traverse(o => { o.frustumCulled = false })
  VRMUtils.rotateVRM0(v)
  scene.add(v.scene)
  vrm = v
  rig = measureVRM(v, camera)
  report()
}).catch(err => { readout.textContent = `load failed: ${err}` })

/* The camera rides the right wrist, because every letter differs only in the
   fingers and a full-body shot cannot show that. */
const wristPos = new THREE.Vector3()
function frameHand() {
  if (!vrm || !rig) return
  if (view === 'bust') {
    /* What the Counter actually shows: the avatar from the chest up. A
       handshape that reads here is a handshape that works in the product. */
    camera.position.set(0, rig.shoulderY + 0.14, 1.05)
    camera.lookAt(0, rig.shoulderY + 0.11, 0)
    camera.updateProjectionMatrix()
    return
  }
  if (view === 'body') {
    camera.position.set(0, rig.shoulderY - 0.1, 2.1)
    camera.lookAt(0, rig.shoulderY - 0.15, 0)
    camera.updateProjectionMatrix()
    return
  }
  const hand = vrm.humanoid.getNormalizedBoneNode('rightHand')
  const tip = vrm.humanoid.getNormalizedBoneNode('rightMiddleDistal')
  if (!hand) return
  hand.getWorldPosition(wristPos)
  /* Centred on the hand itself rather than a fixed offset above the wrist:
     G and H point sideways, P and Q point down, and a fixed offset loses all
     four off the edge of the frame. */
  const aim = wristPos.clone()
  if (tip) {
    const t = new THREE.Vector3()
    tip.getWorldPosition(t)
    aim.lerp(t, 0.8)
  }
  camera.position.set(aim.x - 0.03, aim.y + 0.01, aim.z + 0.33)
  camera.lookAt(aim.x, aim.y, aim.z)
  camera.updateProjectionMatrix()
}

const clock = new THREE.Clock()
function tick() {
  requestAnimationFrame(tick)
  const dt = clock.getDelta()
  if (vrm && rig) {
    applyFrameToVRM(vrm, rig, frame, true, 0, 0)
    vrm.update(dt)
    frameHand()
  }
  renderer.render(scene, camera)
}
tick()

function report() {
  if (!vrm || !rig) return
  const hum = vrm.humanoid
  const rot = (n: string) => {
    const node = hum.getNormalizedBoneNode(n as never)
    return node
      ? `${node.rotation.x.toFixed(2)} ${node.rotation.y.toFixed(2)} ${node.rotation.z.toFixed(2)}`
      : 'MISSING'
  }
  readout.textContent = [
    `vrm            ${url}`,
    `armLen         upper ${rig.armLen.upper.toFixed(3)}  lower ${rig.armLen.lower.toFixed(3)}`,
    `shoulderY      ${rig.shoulderY.toFixed(3)}`,
    `scaleToVrm     ${rig.scaleToVrm.toFixed(3)}`,
    `restDir R      ${rig.restDir.R.toArray().map(n => n.toFixed(2)).join(' ')}`,
    '',
    `hand target    x ${frame.R.pos.x.toFixed(3)}  y ${frame.R.pos.y.toFixed(3)}`,
    `shape          ${frame.R.shape} → ${frame.R.shapeB} @ ${frame.R.blend.toFixed(2)}   palm ${frame.R.palm}`,
    `solved bones   ${frame.R.bones ? Object.keys(frame.R.bones).length : 0}`,
    '',
    'normalized rotations (x y z)',
    `  rightUpperArm      ${rot('rightUpperArm')}`,
    `  rightLowerArm      ${rot('rightLowerArm')}`,
    `  rightHand          ${rot('rightHand')}`,
    `  rightIndexProximal ${rot('rightIndexProximal')}`,
    `  rightIndexInter…   ${rot('rightIndexIntermediate')}`,
    `  rightIndexDistal   ${rot('rightIndexDistal')}`,
    `  rightThumbMetacar… ${rot('rightThumbMetacarpal')}`,
    `  rightThumbProximal ${rot('rightThumbProximal')}`,
    `  rightThumbDistal   ${rot('rightThumbDistal')}`,
    `  rightLittleProxim… ${rot('rightLittleProximal')}`,
  ].join('\n')
}

/* The letters are signed beside the cheek, which is right in the product and
   useless on a bench — the head sits behind every shape. Out to the side the
   hand reads against nothing. */
const CLEAR: { x: number; y: number } = { x: 0.30, y: 0.15 }
const clearOfFace = (f: ResolvedFrame): ResolvedFrame => ({
  ...f,
  R: { ...f.R, pos: { ...CLEAR } },
})

function show(fRaw: ResolvedFrame, label: string, clear = true) {
  const f = clear ? clearOfFace(fRaw) : fRaw
  frame = f
  document.querySelectorAll('button.on').forEach(b => b.classList.remove('on'))
  document.querySelector(`[data-k="${label}"]`)?.classList.add('on')
  setTimeout(report, 50)
}

LETTERS.forEach(l => {
  const b = document.createElement('button')
  b.textContent = l.letter
  b.dataset.k = l.id
  b.onclick = () => show(sampleTrack(l.frames, 0.75), l.id)
  rail.appendChild(b)
})

SHAPE_NAMES.forEach(s => {
  const b = document.createElement('button')
  b.textContent = s
  b.dataset.k = s
  b.onclick = () => show(
    {
      ...sampleTrack(LETTERS[0].frames, 0.75),
      R: { ...sampleTrack(LETTERS[0].frames, 0.75).R, shape: s, shapeB: s, blend: 0, bones: undefined },
    },
    s,
  )
  shapeRail.appendChild(b)
})

/* Every letter in one image, which is the only way to compare 36 handshapes
   against 36 reference drawings without losing your place. */
async function contactSheet(from = 0, count = LETTERS.length, cols = 6) {
  if (!vrm || !rig) return
  const cell = 300
  const set = LETTERS.slice(from, from + count)
  const rows = Math.ceil(set.length / cols)
  const sheet = document.createElement('canvas')
  sheet.width = cols * cell
  sheet.height = rows * cell
  const g = sheet.getContext('2d')!
  g.fillStyle = '#111'
  g.fillRect(0, 0, sheet.width, sheet.height)

  const held = view
  view = 'hand'
  for (let i = 0; i < set.length; i++) {
    frame = clearOfFace(sampleTrack(set[i].frames, 0.75))
    applyFrameToVRM(vrm, rig, frame, true, 0, 0)
    vrm.update(0)
    frameHand()
    renderer.render(scene, camera)
    const x = (i % cols) * cell
    const y = Math.floor(i / cols) * cell
    g.drawImage(renderer.domElement, x, y, cell, cell)
    g.fillStyle = '#7f6bff'
    g.font = 'bold 26px ui-monospace, monospace'
    g.fillText(set[i].letter, x + 10, y + 32)
    g.strokeStyle = '#2b2748'
    g.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
  }
  view = held

  const out = $<HTMLImageElement>('sheet')
  out.src = sheet.toDataURL('image/png')
  out.hidden = false
}

const sheetRail = $('sheets')
;[[0, 12], [12, 12], [24, 12]].forEach(([from, count]) => {
  const b = document.createElement('button')
  b.textContent = `${LETTERS[from].letter}…${LETTERS[from + count - 1].letter}`
  b.onclick = () => {
    contactSheet(from, count, 4).catch(e => { readout.textContent = `sheet failed: ${e}` })
  }
  sheetRail.appendChild(b)
})
$('contact').onclick = () => {
  contactSheet().catch(e => { readout.textContent = `sheet failed: ${e}` })
}

const VIEWS: View[] = ['hand', 'bust', 'body']
/* A handful of whole signs, held at their poster frame. The wrist code these
   letters share is the same code every sign uses, so a change that fixes
   fingerspelling has to be checked against signs too. */
const SIGN_IDS = ['HELLO', 'THANK-YOU', 'PLEASE', 'DOCTOR', 'MY', 'WHERE', 'NEED', 'MEDICINE', 'STOP']
SIGN_IDS.forEach(id => {
  const sign = SIGN_BY_ID[id]
  if (!sign) return
  const b = document.createElement('button')
  b.textContent = id
  b.dataset.k = id
  /* Signs keep their own placement: where the hand goes is half of what a
     sign means, and only the letters share one position. */
  b.onclick = () => show(sampleTrack(sign.frames, 0.55), id, false)
  signRail.appendChild(b)
})

$('follow').onclick = () => {
  view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]
  $('follow').textContent = `Camera: ${view}`
}

show(sampleTrack(LETTERS[0].frames, 0.75), LETTERS[0].id)
