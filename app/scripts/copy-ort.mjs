import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/* onnxruntime's WASM runtime has to be served from our own origin — the
   default is a CDN, and a recogniser that needs a third party to be up is
   not one that "runs offline".
 *
 * It is copied here rather than committed so it can never disagree with the
 * installed onnxruntime-web: a stale binary against a newer JS API fails at
 * runtime, in the browser, with no build error to warn anyone.
 *
 * Only the single-threaded SIMD build is taken. The threaded and JSEP
 * (WebGPU) variants need cross-origin isolation and a GPU path this model
 * has no use for — 175k parameters infer in well under a millisecond on one
 * core. */
const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '..', 'node_modules', 'onnxruntime-web', 'dist')
const to = join(here, '..', 'public', 'ort')

const FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']

mkdirSync(to, { recursive: true })
let total = 0
for (const f of FILES) {
  copyFileSync(join(from, f), join(to, f))
  total += statSync(join(to, f)).size
}
console.log(`[ort] ${FILES.length} files, ${(total / 1e6).toFixed(1)} MB → public/ort/`)
