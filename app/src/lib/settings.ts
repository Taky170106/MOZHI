import { useCallback } from 'react'
import { useLocal } from './hooks'
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
  threshold: 0.78,
  cameraPreview: true,
  faceChannel: true,
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
