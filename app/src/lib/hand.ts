import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/* ============================================================
   hand.ts — telling a hand from a smudge.

   HandLandmarker answers with twenty-one points, a handedness label
   and a confidence score whatever it has locked onto: a collar, a
   shoulder edge, a bright patch in a dark room. Every one of those
   arrives dressed as a hand, so confidence cannot be the test — a
   phantom carries exactly as much of it as a real one.

   The shape can be the test. A hand held up at a counter spans a
   readable slice of the frame; a latched blob collapses to a few
   pixels because the fingers it believes in all landed in the same
   place. Twenty subtractions is enough to tell them apart.

   Both consumers need it and neither may have its own version of it:
   the segmenter decides whether the hands are up at all, and the
   checkpoint's engine decides whether a frame may enter its window.
   One test in one place, so the two cannot disagree about what a hand
   is and then disagree about what was signed.
   ============================================================ */

/** Smallest span, as a fraction of the frame, that still counts as a hand.

    Deliberately loose: a real hand at arm's length covers 0.2-0.3 of a
    640-wide frame, so 0.05 is far below anything a signer produces. It
    is here to reject degenerate detections, not to enforce distance —
    an aggressive number would start refusing hands the moment somebody
    signs from further back, which is the "detects but never recognises"
    failure this whole file exists to avoid. */
export const MIN_HAND_SPAN = 0.05

/** True when `points` is a plausible hand rather than a latched blob.

    `undefined` is false: a hand the landmarker did not produce is not
    a hand, and every caller here is asking exactly that question. */
export function isHand(points: NormalizedLandmark[] | undefined): boolean {
  if (!points || points.length < 21) return false

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity

  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }

  if (!Number.isFinite(x1 - x0) || !Number.isFinite(y1 - y0)) return false
  return Math.max(x1 - x0, y1 - y0) >= MIN_HAND_SPAN
}
