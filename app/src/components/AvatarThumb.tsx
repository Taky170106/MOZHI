import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { applyFrameToVRM, measureVRM, type Rig } from '@/lib/retarget'
import { idleFrame } from '@/lib/player'
import type { ResolvedFrame } from '@/lib/pose'
type Client = { canvas: HTMLCanvasElement; frame: ResolvedFrame | null }

let stage: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  vrm: VRM | null
  rig: Rig | null
} | null = null

const clients = new Set<Client>()
let raf = 0
let loading: Promise<void> | null = null
const STAGE_W = 384
let stageH = 384
function boot() {
  if (stage) return
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(1)
  renderer.setSize(STAGE_W, stageH, false)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.6))
  const key = new THREE.DirectionalLight(0xfff4ea, 2.0)
  key.position.set(0.6, 1.6, 1.4)
  scene.add(key)

  stage = { renderer, scene, camera: new THREE.PerspectiveCamera(26, 1, 0.1, 40), vrm: null, rig: null }
}

function load() {
  if (loading) return loading
  boot()
  const loader = new GLTFLoader()
  loader.register(p => new VRMLoaderPlugin(p))
  loading = loader.loadAsync('./avatar/mozhi-avatar.vrm').then(gltf => {
    const v = gltf.userData.vrm as VRM
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    v.scene.traverse(o => { o.frustumCulled = false })
    VRMUtils.rotateVRM0(v)
    stage!.scene.add(v.scene)
    stage!.vrm = v
    stage!.camera.aspect = STAGE_W / stageH
    stage!.rig = measureVRM(v, stage!.camera)
  }).catch(err => console.error('[AvatarThumb] load failed', err))
  return loading
}

function blit(c: Client) {
  const ctx = c.canvas.getContext('2d')
  if (!ctx || !stage) return
  const src = stage.renderer.domElement
  const w = c.canvas.width, h = c.canvas.height
  const k = Math.min(w / src.width, h / src.height)
  const dw = src.width * k, dh = src.height * k
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function loop() {
  raf = requestAnimationFrame(loop)
  const s = stage
  if (!s || !s.vrm || !s.rig) return
  const now = performance.now()
  const resting = [...clients].filter(c => !c.frame)
  if (resting.length) {
    applyFrameToVRM(s.vrm, s.rig, idleFrame(now, 1), true)
    s.vrm.update(1 / 60)
    s.renderer.render(s.scene, s.camera)
    for (const c of resting) blit(c)
  }

  for (const c of clients) {
    if (!c.frame) continue
    applyFrameToVRM(s.vrm, s.rig, c.frame, true)
    s.vrm.update(1 / 60)
    s.renderer.render(s.scene, s.camera)
    blit(c)
  }
}

function join(c: Client) {
  if (clients.size === 0 && c.canvas.width > 0) {
    stageH = Math.round(STAGE_W * (c.canvas.height / c.canvas.width))
    if (stage) {
      stage.renderer.setSize(STAGE_W, stageH, false)
      stage.camera.aspect = STAGE_W / stageH
      stage.camera.updateProjectionMatrix()
    }
  }
  clients.add(c)
  load()
  if (!raf) raf = requestAnimationFrame(loop)
}
function leave(c: Client) {
  clients.delete(c)
  if (clients.size === 0 && raf) { cancelAnimationFrame(raf); raf = 0 }
}

export default function AvatarThumb({
  frame = null, className, label,
}: { frame?: ResolvedFrame | null; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const client = useRef<Client>({ canvas: null as never, frame: null })
  client.current.frame = frame

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const c = client.current
    c.canvas = canvas
    const dpr = Math.min(2, devicePixelRatio)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    join(c)
    return () => leave(c)
  }, [])

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label={label}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
