import { useCallback } from 'react'
import { useLocal } from './hooks'
import type { SpeechLang } from './speech'
export type CaptionLang = 'en' | 'hi' | 'both'
export type Retention = 'session' | 'shift' | 'off'
export type Settings = {
  site: string
  counter: string
  staff: string

  theme: 'dark' | 'light'
  captionScale: number
  captionLang: CaptionLang
  speed: number

  threshold: number
  cameraPreview: boolean
  faceChannel: boolean

  /* Off by default, and it has to stay that way: the browser's speech
     recogniser is the only part of this product that needs a network. */
  voiceInput: boolean
  speechLang: SpeechLang

  retention: Retention
}

export const DEFAULTS: Settings = {
  site: 'District Hospital',
  counter: 'Counter 2',
  staff: 'R. Sharma',
  theme: 'dark',
  captionScale: 1,
  captionLang: 'en',
  speed: 1,
  /* The recogniser's own floor, from the checkpoint's config.py. Above this
     it also has to read the same sign twice in a row before a word is
     accepted, which is what makes 0.6 a stricter test than it looks. */
  threshold: 0.6,
  cameraPreview: true,
  faceChannel: true,
  voiceInput: false,
  speechLang: 'en-IN',
  retention: 'shift',
}

const KEY = 'sanket.settings.v1'
export function useSettings() {
  const [raw, setRaw] = useLocal<Settings>(KEY, DEFAULTS)
  const settings: Settings = { ...DEFAULTS, ...raw }

  const set = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) =>
      setRaw(prev => ({ ...DEFAULTS, ...prev, [key]: value })),
    [setRaw],
  )
  const reset = useCallback(() => setRaw(DEFAULTS), [setRaw])
  return { settings, set, reset }
}
