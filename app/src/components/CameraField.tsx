import { useEffect, useRef } from 'react'
import { FRAMING } from '@/lib/classifier'
import {
  FilesetResolver,
  HolisticLandmarker,
  type HolisticLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

/* ============================================================
   CameraField — the real inbound pipeline, stages 01 and 02.

   The webcam, and MediaPipe Holistic over it: 33 pose landmarks, 21 per
   hand and a 468-point face mesh. That is the brief's 543 per frame, and
   they are real here — measured off whoever is in front of the camera
   rather than replayed from a fixture.

   What this is NOT is the classifier. Stages 03–05 (the segmenter, the
   BiGRU, the gloss) remain simulated, because there is no trained model in
   this repository. So the panel shows real tracking driving a real skeleton;
   what the machine claims to have UNDERSTOOD is still scripted.

   The wasm and the model are served from public/mediapipe rather than a CDN.
   A product whose whole claim is that it runs offline on a counter's own
   machine cannot reach for Google's servers the first time someone signs.
   ============================================================ */

/* 'starting' is the permission prompt; 'loading' is the model. They are
   separate because the model is ~24MB of wasm and weights and takes seconds
   on a cold cache — a panel that just says "starting" for ten seconds looks
   broken, and the honest fix is to say which of the two is happening. */
export type CameraStatus = 'off' | 'starting' | 'loading' | 'live' | 'denied' | 'error'

type Props = {
  active: boolean
  face?: boolean
  onStatus?: (status: CameraStatus, detail?: string) => void
  /* Every frame that was actually run through Holistic, handed on with the
     video element it came from. The landmarks are what the segmenter reads;
     the video is what the classifier crops. Nothing is retained here — the
     callback is synchronous and the frame is gone when it returns. */
  onFrame?: (result: HolisticLandmarkerResult | null, video: HTMLVideoElement, t: number) => void
  className?: string
}

const asset = (p: string) => `${import.meta.env.BASE_URL}mediapipe/${p}`.replace(/\/{2,}/g, '/')

/* The visitor lane's blue, matched to the simulated field so switching the
   camera on changes what drives the skeleton, not what it looks like. */
const INK_LIT = '#29A9F5'
const INK_FACE = 'rgba(41, 169, 245, 0.55)'

export default function CameraField({ active, face = true, onStatus, onFrame, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* Read through refs inside the loop so toggling the face channel does not
     tear down the camera and re-acquire it. */
  const faceRef = useRef(face)
  faceRef.current = face
  const statusRef = useRef(onStatus)
  statusRef.current = onStatus
  const frameRef = useRef(onFrame)
  frameRef.current = onFrame

  useEffect(() => {
    if (!active) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    /* Bound to non-null locals: `draw` is hoisted and called from several
       places, and TypeScript cannot keep the narrowing above across that. */
    const vid = video
    const cvs = canvas
    const c2d = ctx

    let stream: MediaStream | null = null
    let landmarker: HolisticLandmarker | null = null
    let raf = 0
    let disposed = false
    let lastVideoTime = -1
    let result: HolisticLandmarkerResult | null = null

    const say = (s: CameraStatus, detail?: string) => {
      if (!disposed) statusRef.current?.(s, detail)
    }

    say('starting')

    /* Sized to the element, capped at 2x — the landmark work is per frame and
       a retina backing store buys nothing for a wireframe. */
    let lastW = 0
    let lastH = 0
    let lastDpr = 0
    const resize = () => {
      const r = cvs.getBoundingClientRect()
      if (!r.width || !r.height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (r.width === lastW && r.height === lastH && dpr === lastDpr) return
      lastW = r.width; lastH = r.height; lastDpr = dpr
      cvs.width = Math.round(r.width * dpr)
      cvs.height = Math.round(r.height * dpr)
      draw()   // the resize cleared the buffer; never present it empty
    }

    /* The video is letterboxed into the panel rather than stretched, and the
       landmarks have to use the same box or the skeleton drifts off the body.
       Normalised coordinates are mapped through this one transform. */
    const box = () => {
      const cw = cvs.width
      const ch = cvs.height
      const vw = vid.videoWidth || 4
      const vh = vid.videoHeight || 3
      const scale = Math.max(cw / vw, ch / vh)   // cover
      const w = vw * scale
      const h = vh * scale
      return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
    }

    const dot = (p: NormalizedLandmark, b: ReturnType<typeof box>, r: number, fill: string) => {
      ctx.beginPath()
      /* Mirrored horizontally: a counter display is a mirror to the person
         standing at it, so raising your right hand raises the skeleton's. */
      ctx.arc(b.x + (1 - p.x) * b.w, b.y + p.y * b.h, r, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
    }

    const link = (
      pts: NormalizedLandmark[],
      pairs: readonly { start: number; end: number }[],
      b: ReturnType<typeof box>,
      width: number,
      stroke: string,
    ) => {
      ctx.lineWidth = width
      ctx.strokeStyle = stroke
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const { start, end } of pairs) {
        const a = pts[start]
        const c = pts[end]
        if (!a || !c) continue
        ctx.moveTo(b.x + (1 - a.x) * b.w, b.y + a.y * b.h)
        ctx.lineTo(b.x + (1 - c.x) * b.w, b.y + c.y * b.h)
      }
      ctx.stroke()
    }

    function draw() {
      const ctx = c2d
      const cw = cvs.width
      const ch = cvs.height
      const dpr = lastDpr || 1

      ctx.clearRect(0, 0, cw, ch)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, cw, ch)

      const b = box()

      /* The feed is shown, but held right down. It is there so a visitor can
         see the camera really is on and pointed at them; the bright layer is
         the landmark set, because the landmarks are what the machine keeps. */
      if (vid.readyState >= 2) {
        ctx.save()
        ctx.globalAlpha = 0.22
        ctx.filter = 'grayscale(1) contrast(1.15)'
        ctx.translate(cw, 0)
        ctx.scale(-1, 1)                     // mirror, as above
        c2d.drawImage(vid, cw - b.x - b.w, b.y, b.w, b.h)
        ctx.restore()
        ctx.filter = 'none'
      }

      if (!result) return

      const pose = result.poseLandmarks?.[0]
      if (pose) {
        link(pose, HolisticLandmarker.POSE_CONNECTIONS, b, 2 * dpr, 'rgba(27, 110, 243, 0.85)')
        for (const p of pose) dot(p, b, 2.2 * dpr, INK_LIT)
      }

      for (const hand of [result.leftHandLandmarks?.[0], result.rightHandLandmarks?.[0]]) {
        if (!hand) continue
        link(hand, HolisticLandmarker.HAND_CONNECTIONS, b, 1.6 * dpr, 'rgba(41, 169, 245, 0.9)')
        for (const p of hand) dot(p, b, 1.7 * dpr, '#9BD8FF')
      }

      /* The face channel is a real toggle here, not a label: switching it off
         stops the mesh being drawn at all, which is the brief's point that
         ISL grammar lives on the face. */
      if (faceRef.current) {
        const mesh = result.faceLandmarks?.[0]
        if (mesh) for (const p of mesh) dot(p, b, 0.75 * dpr, INK_FACE)
      }
    }

    const tick = () => {
      if (disposed) return
      raf = requestAnimationFrame(tick)
      if (!landmarker || vid.readyState < 2) return

      /* detectForVideo rejects a repeated timestamp, and the camera delivers
         frames more slowly than the display refreshes. */
      if (vid.currentTime !== lastVideoTime) {
        lastVideoTime = vid.currentTime
        const t = performance.now()
        try {
          result = landmarker.detectForVideo(vid, t)
        } catch {
          /* A dropped frame is not worth tearing the panel down for. */
        }
        /* The recogniser runs on the frames that were actually tracked, not
           on every display refresh — classifying the same frame twice would
           double its weight in the hold average for no new information. */
        try {
          frameRef.current?.(result, vid, t)
        } catch (err) {
          /* A fault downstream must not stop the tracking. */
          console.error('[CameraField] frame consumer threw', err)
        }
      }
      draw()
    }

    ;(async () => {
      /* Both started at once. The model does not need the camera and the
         camera does not need the model, so waiting for one before beginning
         the other would add the whole download to the time before anything
         appears. The permission prompt goes up immediately either way. */
      const modelReady = (async () => {
        const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))
        return HolisticLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: asset('models/holistic_landmarker.task'), delegate: 'GPU' },
          runningMode: 'VIDEO',
          /* Only in framed mode: the mask is what framing.ts uses to cut the
             room away, and computing one nobody reads is wasted GPU. */
          outputPoseSegmentationMasks: FRAMING,
        })
      })()
      // An early failure here must not surface as an unhandled rejection.
      modelReady.catch(() => {})

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        })
      } catch (err) {
        const name = (err as DOMException)?.name
        say(name === 'NotAllowedError' ? 'denied' : 'error', name)
        modelReady.then(l => l.close()).catch(() => {})
        return
      }
      if (disposed) { stream.getTracks().forEach(t => t.stop()); return }

      vid.srcObject = stream
      await vid.play().catch(() => {})

      say('loading')
      try {
        landmarker = await modelReady
      } catch (err) {
        say('error', String((err as Error)?.message ?? err))
        return
      }
      if (disposed) { landmarker.close(); return }

      resize()
      window.addEventListener('resize', resize)
      say('live')
      raf = requestAnimationFrame(tick)
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      /* Every track stopped, so the browser's camera indicator goes out the
         moment this is switched off. Anything less would be the one thing a
         privacy claim cannot afford to get wrong. */
      stream?.getTracks().forEach(t => t.stop())
      vid.srcObject = null
      landmarker?.close()
      say('off')
    }
  }, [active])

  return (
    <div className={className}>
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
    </div>
  )
}
