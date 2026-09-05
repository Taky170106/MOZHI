import { buildField, updateField, OFF_HAND_R, OFF_HAND_L, OFF_FACE } from '../src/lib/pose3d'
import { buildTimeline, frameAtTime } from '../src/lib/player'

const tl = buildTimeline(['DOCTOR', 'SEE', 'NEED'], 1)
const F = buildField()

// sample the readable peak of each sign, plus one co-articulation moment
const shots = tl.segments.map(s => ({ id: s.id, t: (s.stroke + s.end) / 2, kind: 'hold' }))
shots.push({ id: 'coart', t: (tl.segments[0].end + tl.segments[1].start) / 2, kind: 'between' })

const out = shots.map(sh => {
  const h = frameAtTime(tl, sh.t)
  updateField(F, h.frame, sh.t)
  return {
    id: sh.id, kind: sh.kind, t: Math.round(sh.t), holding: h.holding,
    positions: Array.from(F.positions).map(v => +v.toFixed(4)),
    groups: Array.from(F.groups),
    bones: Array.from(F.bones),
    faceLines: Array.from(F.faceLines),
    brow: +h.frame.brow.toFixed(3), mouth: +h.frame.mouth.toFixed(3),
    shape: h.frame.R.shape,
  }
})
console.log(JSON.stringify(out))
