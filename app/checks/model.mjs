import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/* ============================================================
   checks/model.mjs — is the exported classifier usable?

       node checks/model.mjs [dir]

   Run this the moment a new export is dropped into public/models/tm/.
   It answers two questions, and the second one exists because of a real
   incident: a Teachable Machine export arrived with the architecture
   intact and every one of its 541,508 parameters set to zero. It loaded
   without error. It predicted a clean softmax. Every answer was 1/32 —
   an untrained model, which looks exactly like a working one until you
   read the numbers.

     1. do the class names map onto lexicon ids?
     2. does the model actually contain weights, and do different inputs
        produce different outputs?

   Question 1 needs nothing installed. Question 2 loads the model through
   the same tfjs the browser uses, and is skipped if node_modules is not
   there — a partial answer beats a crash.
   ============================================================ */

const here = dirname(fileURLToPath(import.meta.url))
const MODEL_DIR = process.argv[2] ?? join(here, '..', 'public', 'models', 'tm')

const lexicon = [
  ...readFileSync(join(here, '..', 'src', 'lib', 'lexicon.ts'), 'utf8')
    .matchAll(/^\s*id: '([A-Z0-9-]+)'/gm),
].map(m => m[1])

const NULL_LABELS = new Set(['background', 'none', 'nothing', 'rest', 'idle', 'neutral', 'blank'])
const toGloss = s => s.trim().toUpperCase().replace(/[\s_]+/g, '-')

let failed = false
const fail = msg => { failed = true; console.log(msg) }

/* ---- 1. the files ------------------------------------------- */

const metaPath = join(MODEL_DIR, 'metadata.json')
if (!existsSync(metaPath)) {
  console.log(`\nNo model exported yet — ${metaPath} is missing.`)
  console.log('Teachable Machine → Export Model → TensorFlow.js → Download my model.')
  console.log(`\nThe lexicon has ${lexicon.length} signs, so that is the target class count.\n`)
  process.exit(0)
}

if (!existsSync(join(MODEL_DIR, 'model.json'))) {
  console.log('\nFAIL  metadata.json is there but model.json is not.')
  console.log('      Copy the whole TensorFlow.js export, weights .bin shards included.\n')
  process.exit(1)
}

const labels = JSON.parse(readFileSync(metaPath, 'utf8')).labels ?? []
const mapped = labels.filter(l => !NULL_LABELS.has(l.trim().toLowerCase()))
const nulls = labels.filter(l => NULL_LABELS.has(l.trim().toLowerCase()))

const unmapped = mapped.filter(l => !lexicon.includes(toGloss(l)))
const covered = new Set(mapped.map(toGloss).filter(g => lexicon.includes(g)))
const missing = lexicon.filter(id => !covered.has(id))

console.log(`\n${labels.length} classes exported · ${covered.size}/${lexicon.length} of the lexicon covered`)

if (nulls.length) console.log(`null class: ${nulls.join(', ')}  ✓ — an empty counter can read as nothing`)
else console.log('null class: NONE — add a "Background" class, or an empty counter reads as a sign')

if (unmapped.length) {
  fail(`\nFAIL  ${unmapped.length} class(es) are not in the lexicon and will never be committed:`)
  for (const l of unmapped) console.log(`      "${l}" → ${toGloss(l)}`)
  console.log('      Rename them in Teachable Machine, or add them to src/lib/lexicon.ts.')
}

if (missing.length) {
  console.log(`\n${missing.length} sign(s) still untrained — the avatar can sign these, the camera cannot read them:`)
  console.log('      ' + missing.join(' '))
}

/* ---- 2. the weights ----------------------------------------- */

let tf
try {
  tf = await import('@tensorflow/tfjs')
} catch {
  console.log('\n(skipping the weight check — run npm install first)\n')
  process.exit(failed ? 1 : 0)
}

const modelJson = JSON.parse(readFileSync(join(MODEL_DIR, 'model.json'), 'utf8'))
const manifest = modelJson.weightsManifest ?? []

/* Shards are concatenated in manifest order, exactly as the browser does. */
const shards = manifest.flatMap(g => g.paths)
const specs = manifest.flatMap(g => g.weights)
for (const p of shards) {
  if (!existsSync(join(MODEL_DIR, p))) {
    fail(`\nFAIL  model.json refers to ${p}, which is not in the folder.`)
    console.log('      Copy every .bin shard from the export, not just the first.\n')
    process.exit(1)
  }
}
const bytes = Buffer.concat(shards.map(p => readFileSync(join(MODEL_DIR, p))))

await tf.setBackend('cpu')
let model
try {
  model = await tf.loadLayersModel({
    load: async () => ({
      modelTopology: modelJson.modelTopology,
      weightSpecs: specs,
      weightData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
  })
} catch (err) {
  fail(`\nFAIL  tfjs could not load this model:\n      ${err.message}\n`)
  process.exit(1)
}

const size = model.inputs[0].shape[1] ?? 224
const outs = model.outputs[0].shape[1]
let params = 0
for (const w of model.weights) params += w.shape.reduce((a, b) => a * b, 1)
console.log(`\nloaded · input ${size}×${size} · ${outs} outputs · ${params.toLocaleString()} parameters`)

if (outs !== labels.length) {
  fail(`FAIL  the model has ${outs} outputs but metadata.json lists ${labels.length} labels.`)
}

/* Is there anything in it at all? */
let nonzero = 0
for (const w of model.weights) {
  const d = w.read().dataSync()
  for (let i = 0; i < d.length; i++) if (d[i] !== 0) { nonzero++; break }
}
if (nonzero === 0) {
  fail('\nFAIL  every parameter in this model is zero — it was exported untrained.')
  console.log('      It will load, predict, and return an identical guess for every')
  console.log('      input. Nothing can recover the weights from this file: the')
  console.log('      classes have to be retrained and re-exported.\n')
  process.exit(1)
}

/* Does the input reach the output? */
const run = t => { const p = model.predict(t); const v = Array.from(p.dataSync()); p.dispose(); t.dispose(); return v }
const a = run(tf.zeros([1, size, size, 3]))
const b = run(tf.randomUniform([1, size, size, 3], -1, 1))
if (a.every((x, i) => Math.abs(x - b[i]) < 1e-6)) {
  fail('\nFAIL  two very different inputs produced the same prediction.')
  console.log('      The image is not reaching the classifier. Do not demo this.\n')
  process.exit(1)
}

const spread = Math.max(...a) - Math.min(...a)
console.log(`weights present · input changes the output ✓ · spread ${spread.toFixed(3)}`)
console.log(failed ? '\nfinished with problems above\n' : '\nthis model is ready to use\n')
process.exit(failed ? 1 : 0)
