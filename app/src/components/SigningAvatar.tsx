import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import type { ResolvedFrame } from '../lib/pose'
import { applyFrameToVRM, measureVRM, type Rig } from '../lib/retarget'
type Props = {
  frame: ResolvedFrame

  face?: boolean
  /* Degrees of turn away from square-on. A signer never faces a camera dead
     flat — a few degrees of yaw is what stops the avatar reading as a photo
     of a mannequin. */
  yaw?: number
  className?: string
  label?: string
}

export default function SigningAvatar({ frame, face = true, yaw = 0, className, label }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const frameRef = useRef(frame)
  frameRef.current = frame
  const faceRef = useRef(face)
  faceRef.current = face
  const yawRef = useRef(yaw)
  yawRef.current = yaw
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })

    scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const key = new THREE.DirectionalLight(0xfff0e2, 2.1)
    key.position.set(0.6, 1.6, 1.4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xffb27a, 1.1)
    rim.position.set(-1.2, 0.9, -1.0)
    scene.add(rim)

    let vrm: VRM | null = null
    let disposed = false
    let raf = 0
    const clock = new THREE.Clock()
    let rig: Rig | null = null

    const loader = new GLTFLoader()
    loader.register(p => new VRMLoaderPlugin(p))

    loader.loadAsync('./avatar/sanket-avatar.vrm').then(gltf => {
      if (disposed) return
      const v = gltf.userData.vrm as VRM
      VRMUtils.removeUnnecessaryVertices(gltf.scene)
      VRMUtils.combineSkeletons(gltf.scene)
      v.scene.traverse(o => { o.frustumCulled = false })

      VRMUtils.rotateVRM0(v)
      v.scene.rotation.y = THREE.MathUtils.degToRad(yawRef.current)
      scene.add(v.scene)
      vrm = v

      rig = measureVRM(v, camera)

      resize()
      setStatus('ready')
    }).catch(err => {
      if (!disposed) { setStatus('error'); console.error('[SigningAvatar] load failed', err) }
    })

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = clock.getDelta()
      if (vrm && rig) {
        vrm.scene.rotation.y = THREE.MathUtils.degToRad(yawRef.current)
        applyFrameToVRM(
          vrm, rig, frameRef.current, faceRef.current,
          clock.getElapsedTime(), reduced ? 0 : 1,
        )
        vrm.update(reduced ? 0 : dt)
      }
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    let lastW = 0
    let lastH = 0
    let lastDpr = 0
    const resize = () => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      const dpr = Math.min(2, devicePixelRatio)
      if (w === lastW && h === lastH && dpr === lastDpr) return
      const dprChanged = dpr !== lastDpr
      lastW = w; lastH = h; lastDpr = dpr

      if (dprChanged) renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()

      renderer.render(scene, camera)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene) }
      renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div ref={host} className={className} role="img" aria-label={label}>
      {status !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="m text-[0.56rem] tracking-[0.2em] text-white/35 uppercase">
            {status === 'loading' ? 'Loading avatar…' : 'Avatar unavailable'}
          </span>
        </div>
      )}
    </div>
  )
}
