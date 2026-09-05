/* ============================================================
   flags.ts — build-time switches.

   One place, so a surface is never half-hidden: the nav, the
   footer call-to-action and the router all read the same values.

   Flip a flag, reload. Nothing else has to change.
   ============================================================ */

/**
 * Which product surfaces are built and reachable.
 *
 * A surface set to `false` still appears in the nav — the nav is the
 * product's shape and should not shrink while it is being built — but the
 * route renders the in-development notice instead of the page. Typing or
 * pasting the hash lands on the same notice, so there is no back way in.
 */
export const SURFACES = {
  counter: true,
  vocabulary: true,
  archive: true,
  settings: true,
} as const

export type Surface = keyof typeof SURFACES

export const isOpen = (s: string): s is Surface =>
  Object.prototype.hasOwnProperty.call(SURFACES, s) && SURFACES[s as Surface]

/** Every surface the nav lists, open or not. */
export const isSurface = (s: string): s is Surface =>
  Object.prototype.hasOwnProperty.call(SURFACES, s)

/**
 * The VRM signing avatar — the staff-side stage and the full-screen
 * visitor display.
 *
 * While this is false both stages render a placeholder instead of loading
 * the rig. The gloss chips stay: the sequence the reply resolves to is
 * still correct and still worth showing, it simply is not performed.
 */
export const AVATAR_ENABLED = true

/**
 * The inbound classifier — stages 04 and 05 of the sign-to-text lane.
 *
 * This does NOT gate the camera. With the model off, MediaPipe Holistic
 * still runs and still draws its 543 landmarks over the video: the tracking
 * is real and visible. What is switched off is the part that claims to have
 * *understood* the movement, so nothing is read, scored or committed from
 * an untrained model.
 */
export const MODEL_ENABLED = true
