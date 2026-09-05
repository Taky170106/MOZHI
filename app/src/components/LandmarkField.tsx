import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { buildField, updateField, N_TOTAL, OFF_HAND_R, OFF_HAND_L } from '../lib/pose3d'
import type { ResolvedFrame } from '../lib/pose'
export type FieldDirection = 'in' | 'out'

const TRACKED = [0, 4, 8, 12, 16, 20]
const TRAIL_LEN = 22
type Props = {
  frame: ResolvedFrame
  direction?: FieldDirection

  parallax?: boolean

  drift?: boolean

  boot?: boolean

  trails?: boolean

  face?: boolean

  bloom?: boolean

  tone?: 'glow' | 'ink'

  zoom?: number
  className?: string
  label?: string
}

const readVar = (el: HTMLElement, name: string, fallback: string) => {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

export default function LandmarkField({
  frame,
  direction = 'in',
  parallax = true,
  drift = true,
  boot = false,
  trails = false,
  face = true,
  bloom = false,
  tone = 'ink',
  zoom = 1,
  className,
  label,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const frameRef = useRef(frame)
  frameRef.current = frame
  const faceRef = useRef(face)
  faceRef.current = face

  useEffect(() => {
    const el = host.current
    if (!el) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const F = buildField()
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 0)
    el.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })

    const posAttr = new THREE.BufferAttribute(F.positions, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)

    const pts = new THREE.BufferGeometry()
    pts.setAttribute('position', posAttr)
    pts.setAttribute('aGroup', new THREE.BufferAttribute(F.groups, 1))
    pts.setAttribute('aSeed', new THREE.BufferAttribute(F.seeds, 1))

    const boneGeo = new THREE.BufferGeometry()
    boneGeo.setAttribute('position', posAttr)
    boneGeo.setIndex(new THREE.BufferAttribute(F.bones, 1))

    const faceGeo = new THREE.BufferGeometry()
    faceGeo.setAttribute('position', posAttr)
    faceGeo.setIndex(new THREE.BufferAttribute(F.faceLines, 1))

    const names = tone === 'ink'
      ? (direction === 'out'
          ? ['--warm-deep', '--warm-deep', '--warm', '--warm-mid']
          : ['--cool-deep', '--cool-deep', '--cool', '--cool-mid'])
      : (direction === 'out'
          ? ['--warm-lit', '--warm-lit', '--warm-mid', '--warm-glow']
          : ['--cool-lit', '--cool-lit', '--cool-mid', '--cool-glow'])
    const fb = direction === 'out'
      ? ['#B00A7A', '#B00A7A', '#FD48F2', '#FFDBFD']
      : ['#241C6B', '#241C6B', '#3B308F', '#5A4DC2']
    const palette = names.map((v, i) => new THREE.Color(readVar(el, v, fb[i])))
    const additive = tone === 'glow'

    const uniforms = {
      uGlow: { value: additive ? 1 : 0 },
      uPose: { value: palette[0] },
      uHand: { value: palette[1] },
      uFace: { value: palette[2] },
      uKey: { value: palette[3] },
      uScale: { value: 1 },
      uOpacity: { value: 0 },
      uBoot: { value: boot && !reduced ? 0 : 1 },
      uFaceOn: { value: 1 },
    }

    const pointMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float aGroup;
        attribute float aSeed;
        uniform vec3 uPose, uHand, uFace, uKey;
        uniform float uFaceOn;
        uniform float uScale, uBoot, uGlow;
        varying vec3 vCol;
        varying float vDim;
        void main() {
          vec3 c = uFace; float s = 3.4; float dim = 0.62;
          bool isFace = aGroup > 1.5 && aGroup < 2.5;
          if (aGroup < 0.5)      { c = uPose; s = 6.5; dim = 1.0; }
          else if (aGroup < 1.5) { c = uHand; s = 5.6; dim = 1.0; }
          else if (aGroup > 2.5) { c = uKey;  s = 9.0; dim = 1.0; }
          if (isFace && uFaceOn < 0.5) { dim = 0.0; s = 0.0; }

          float lead = aSeed * 0.42;
          float t = clamp((uBoot - lead) / 0.58, 0.0, 1.0);
          t = 1.0 - pow(1.0 - t, 3.0);
          vec3 scatter = vec3(
            sin(aSeed * 61.7) * 1.9,
            cos(aSeed * 27.3) * 1.35,
            sin(aSeed * 43.1) * 1.5
          );
          vec3 p = mix(position + scatter, position, t);

          vCol = c;
          vDim = dim * t;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDim *= mix(1.0, clamp(1.0 + mv.z * 0.42, 0.30, 1.4), uGlow * 0.85 + 0.15);
          gl_PointSize = s * uScale * (1.0 / max(0.35, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol;
        varying float vDim;
        uniform float uOpacity, uGlow;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.0, r);
          float core = smoothstep(0.06, 0.0, r) * 0.55;
          vec3 c = vCol * (1.0 + core * uGlow);
          float alpha = mix(a, min(1.0, a + core), uGlow);
          gl_FragColor = vec4(c, alpha * vDim * uOpacity);
        }`,
    })

    const lineBlend = additive ? THREE.AdditiveBlending : THREE.NormalBlending
    const boneMat = new THREE.LineBasicMaterial({
      color: palette[1], transparent: true, opacity: 0, depthWrite: false, blending: lineBlend,
    })
    const faceMat = new THREE.LineBasicMaterial({
      color: palette[2], transparent: true, opacity: 0, depthWrite: false, blending: lineBlend,
    })

    const rig = new THREE.Group()
    rig.add(new THREE.Points(pts, pointMat))
    rig.add(new THREE.LineSegments(boneGeo, boneMat))
    const faceRings = new THREE.LineSegments(faceGeo, faceMat)
    rig.add(faceRings)

    const trailCount = TRACKED.length * 2 * TRAIL_LEN
    const trailPos = new Float32Array(trailCount * 3)
    const trailAge = new Float32Array(trailCount).fill(1)
    let trailHead = 0
    let trailMesh: THREE.Points | null = null
    const trailUniforms = { uCol: { value: palette[3] }, uScale: { value: 1 }, uOpacity: { value: 0 } }
    if (trails && !reduced) {
      const tg = new THREE.BufferGeometry()
      tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage))
      tg.setAttribute('aAge', new THREE.BufferAttribute(trailAge, 1).setUsage(THREE.DynamicDrawUsage))
      const tm = new THREE.ShaderMaterial({
        uniforms: trailUniforms,
        transparent: true, depthWrite: false, blending: lineBlend,
        vertexShader: `
          attribute float aAge;
          uniform float uScale;
          varying float vA;
          void main() {
            vA = 1.0 - aAge;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = (1.0 + vA * 3.4) * uScale * (1.0 / max(0.35, -mv.z));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uCol; uniform float uOpacity;
          varying float vA;
          void main() {
            vec2 d = gl_PointCoord - vec2(0.5);
            float r = dot(d, d);
            if (r > 0.25) discard;
            float a = smoothstep(0.25, 0.0, r);
            gl_FragColor = vec4(uCol, a * vA * vA * 0.55 * uOpacity);
          }`,
      })
      trailMesh = new THREE.Points(tg, tm)
      rig.add(trailMesh)
    }

    scene.add(rig)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    let bloomPass: UnrealBloomPass | null = null
    if (bloom) {
      bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.05)
      composer.addPass(bloomPass)
    }

    const baseZ = 1.9 / zoom
    let lastW = 0
    let lastH = 0
    let lastDpr = 0
    const resize = () => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (r.width === lastW && r.height === lastH && dpr === lastDpr) return
      const dprChanged = dpr !== lastDpr
      lastW = r.width; lastH = r.height; lastDpr = dpr

      if (dprChanged) { renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr) }
      renderer.setSize(r.width, r.height, false)
      composer.setSize(r.width, r.height)
      bloomPass?.setSize(r.width, r.height)
      camera.aspect = r.width / r.height
      camera.position.z = baseZ * Math.max(1, 1.05 / camera.aspect)
      camera.updateProjectionMatrix()
      const s = Math.min(r.height / 420, 1.7) * dpr * 0.8
      uniforms.uScale.value = s
      trailUniforms.uScale.value = s

      composer.render()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let tx = 0, ty = 0, mx = 0, my = 0
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2
    }
    const onLeave = () => { tx = 0; ty = 0 }
    const target = parallax && !reduced ? el : null
    target?.addEventListener('pointermove', onMove)
    target?.addEventListener('pointerleave', onLeave)

    let raf = 0
    let frames = 0
    let bootT = uniforms.uBoot.value
    let lastTrail = 0
    const onVisible = () => { if (document.visibilityState === 'visible') frames = 0 }
    document.addEventListener('visibilitychange', onVisible)

    const tick = (now: number) => {
      frames++

      uniforms.uFaceOn.value = faceRef.current ? 1 : 0
      faceRings.visible = faceRef.current

      updateField(F, frameRef.current, now)
      posAttr.needsUpdate = true

      if (trailMesh && now - lastTrail > 28) {
        lastTrail = now
        for (const off of [OFF_HAND_R, OFF_HAND_L]) {
          for (const j of TRACKED) {
            const src = (off + j) * 3
            const dst = trailHead * 3
            trailPos[dst] = F.positions[src]
            trailPos[dst + 1] = F.positions[src + 1]
            trailPos[dst + 2] = F.positions[src + 2]
            trailAge[trailHead] = 0
            trailHead = (trailHead + 1) % trailCount
          }
        }
        for (let i = 0; i < trailCount; i++) trailAge[i] = Math.min(1, trailAge[i] + 1 / TRAIL_LEN)
        const g = trailMesh.geometry
        g.attributes.position.needsUpdate = true
        g.attributes.aAge.needsUpdate = true
      }

      mx += (tx - mx) * 0.055
      my += (ty - my) * 0.055

      const idle = drift && !reduced ? Math.sin(now / 7000) * 0.22 : 0
      rig.rotation.y = idle + mx * 0.45
      rig.rotation.x = my * 0.2

      const hidden = document.visibilityState === 'hidden'
      const fade = hidden ? 1 : Math.min(1, frames / 40)
      if (bootT < 1) { bootT = hidden ? 1 : Math.min(1, bootT + 0.0115); uniforms.uBoot.value = bootT }

      uniforms.uOpacity.value = fade
      trailUniforms.uOpacity.value = fade * bootT
      boneMat.opacity = fade * bootT * (additive ? 0.30 : 0.55)
      faceMat.opacity = fade * bootT * (additive ? 0.13 : 0.22)

      composer.render()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisible)
      ro.disconnect()
      target?.removeEventListener('pointermove', onMove)
      target?.removeEventListener('pointerleave', onLeave)
      trailMesh?.geometry.dispose()
      ;(trailMesh?.material as THREE.Material | undefined)?.dispose()
      pts.dispose(); boneGeo.dispose(); faceGeo.dispose()
      pointMat.dispose(); boneMat.dispose(); faceMat.dispose()
      bloomPass?.dispose()
      composer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [direction, parallax, drift, boot, trails, bloom, tone, zoom])

  return (
    <div
      ref={host}
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

export const FIELD_CENSUS = { total: N_TOTAL, pose: 33, hands: 42, face: 468 }
