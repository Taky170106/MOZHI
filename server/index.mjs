import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HOST = process.env.MOZHI_HOST ?? '127.0.0.1'
const PORT = Number(process.env.MOZHI_PORT ?? 5301)
const here = dirname(fileURLToPath(import.meta.url))
const db = new DatabaseSync(join(here, 'mozhi.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS turns (
    id          TEXT PRIMARY KEY,
    dir         TEXT NOT NULL CHECK (dir IN ('in', 'out')),
    text        TEXT NOT NULL,
    glosses     TEXT NOT NULL,
    conf        REAL,
    repeated    INTEGER NOT NULL DEFAULT 0,
    text_only   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS turns_created_at ON turns (created_at);
`)

const SEED = [
  { dir: 'in',  text: 'The morning train was delayed.',                     glosses: ['MORNING', 'TRAIN', 'DELAY'],            conf: 0.92 },
  { dir: 'out', text: 'That is not a problem, your appointment is still open.', glosses: ['NO', 'BAD', 'APPOINTMENT', 'OPEN'] },
  { dir: 'in',  text: 'When will the test report be ready?',                glosses: ['TEST', 'REPORT', 'WHEN'],               conf: 0.81, repeated: true },
  { dir: 'out', text: 'Come tomorrow morning for the report.',              glosses: ['TOMORROW', 'MORNING', 'REPORT', 'COME'] },
  { dir: 'in',  text: 'My head hurts.',                                     glosses: ['MY', 'HEAD', 'PAIN'],                   conf: 0.89 },
  { dir: 'out', text: 'The pharmacy is room number 2.',                     glosses: ['MEDICINE', 'ROOM', 'NUMBER'],           textOnly: true },
  { dir: 'in',  text: 'I need to see a doctor soon.',                       glosses: ['DOCTOR', 'SEE', 'NEED'],                conf: 0.94 },
  { dir: 'out', text: 'Please wait, the doctor will see you shortly.',      glosses: ['PLEASE', 'WAIT', 'DOCTOR', 'SEE', 'YOU'] },
  { dir: 'out', text: 'Go to room number 2.',                               glosses: ['ROOM', 'NUMBER', 'GO'] },
]

function addTurn(t, createdAt = new Date().toISOString()) {
  const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  db.prepare(`
    INSERT INTO turns (id, dir, text, glosses, conf, repeated, text_only, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    t.dir,
    t.text,
    JSON.stringify(t.glosses ?? []),
    t.conf ?? null,
    t.repeated ? 1 : 0,
    t.textOnly ? 1 : 0,
    createdAt,
  )
  return { id, ...t, createdAt }
}

if (db.prepare('SELECT COUNT(*) AS n FROM turns').get().n === 0) {
  const step = 4 * 60 * 1000
  const base = Date.now() - SEED.length * step
  SEED.forEach((t, i) => addTurn(t, new Date(base + i * step).toISOString()))
  console.log(`[mozhi-log] seeded ${SEED.length} turns`)
}

const rowToTurn = (r) => ({
  id: r.id,
  dir: r.dir,
  text: r.text,
  glosses: JSON.parse(r.glosses),
  conf: r.conf ?? undefined,
  repeated: !!r.repeated,
  textOnly: !!r.text_only,
  createdAt: r.created_at,
})

const listTurns = () =>
  db.prepare('SELECT * FROM turns ORDER BY created_at ASC, rowid ASC').all()
const clearTurns = () => db.prepare('DELETE FROM turns').run()
const send = (res, status, body) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',

    'access-control-allow-origin': 'http://127.0.0.1:5300',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(payload)
}

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 64_000) reject(new Error('body too large'))
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('invalid JSON')) }
    })
    req.on('error', reject)
  })

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (req.method === 'OPTIONS') return send(res, 204, {})

  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true, turns: listTurns().length })
  }

  if (url.pathname === '/api/turns') {
    if (req.method === 'GET') {
      return send(res, 200, { turns: listTurns().map(rowToTurn) })
    }

    if (req.method === 'POST') {
      try {
        const body = await readJson(req)
        if (body.dir !== 'in' && body.dir !== 'out') {
          return send(res, 400, { error: "dir must be 'in' or 'out'" })
        }
        if (typeof body.text !== 'string' || !body.text.trim()) {
          return send(res, 400, { error: 'text is required' })
        }
        if (!Array.isArray(body.glosses)) {
          return send(res, 400, { error: 'glosses must be an array' })
        }

        return send(res, 201, { turn: addTurn({
          dir: body.dir,
          text: body.text.trim(),
          glosses: body.glosses.map(String),
          conf: typeof body.conf === 'number' ? body.conf : undefined,
          repeated: !!body.repeated,
          textOnly: !!body.textOnly,
        }) })
      } catch (err) {
        return send(res, 400, { error: err.message })
      }
    }

    if (req.method === 'DELETE') {
      clearTurns()
      return send(res, 200, { cleared: true })
    }
  }

  send(res, 404, { error: 'not found' })
}).listen(PORT, HOST, () => {
  console.log(`[mozhi-log] http://${HOST}:${PORT}  ·  ${join(here, 'mozhi.db')}`)
})
