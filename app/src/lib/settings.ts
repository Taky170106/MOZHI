import { useCallback } from 'react'
import { useLocal } from './hooks'
import type { SpeechLang } from './speech'
/* 'hi' is the second-language slot; on this terminal it renders Tamil. The
   id is kept as 'hi' so the caption pipeline and stored settings do not have
   to migrate. */
export type CaptionLang = 'en' | 'hi' | 'both'
export type Retention = 'session' | 'shift' | 'off'
export type Settings = {
  site: string
  counter: string
  staff: string

  theme: 'dark' | 'light'
  /* Camera lift: 0 raw, 1 normalised, 2 bright. This is applied to the frames
     the landmarker READS, not only to the preview: a dim counter drops the
     hand under MediaPipe's 0.5 detection floor, and a hand it never saw is a
     word the model never gets a chance to guess. */
  videoBoost: 0 | 1 | 2
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
  site: 'City Police Station',
  counter: 'Front Desk 2',
  staff: 'K. Murugan',
  theme: 'dark',
  videoBoost: 1,
  captionScale: 1,
  /* Both scripts by default: this counter serves a Tamil-speaking public, so
     the English line for the clerk and the Tamil line for the visitor are
     shown together out of the box. */
  captionLang: 'both',
  speed: 1,
  /* The recogniser's own floor, from the checkpoint's config.py. Above this
     it also has to read the same sign twice in a row before a word is
     accepted, which is what makes 0.6 a stricter test than it looks. */
  threshold: 0.6,
  cameraPreview: true,
  faceChannel: true,
  voiceInput: false,
  speechLang: 'ta-IN',
  retention: 'shift',
}

/* Bumped to v2 when the terminal was reconfigured for a Tamil police-station
   counter: a v1 blob persisted under the old hospital/English defaults would
   otherwise shadow the new defaults on a machine that had already run it. */
const KEY = 'sanket.settings.v2'
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
