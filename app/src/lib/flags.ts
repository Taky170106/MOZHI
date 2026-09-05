export const SURFACES = {
  counter: false,
  vocabulary: true,
  archive: true,
  settings: true,
} as const

export type Surface = keyof typeof SURFACES

export const isOpen = (s: string): s is Surface =>
  Object.prototype.hasOwnProperty.call(SURFACES, s) && SURFACES[s as Surface]

export const isSurface = (s: string): s is Surface =>
  Object.prototype.hasOwnProperty.call(SURFACES, s)
