import { SEED_TURNS, type Turn } from './turns'

/* ============================================================
   api.ts — where the transcript lives.

   It used to live in server/index.mjs, a SQLite file beside the dev server.
   That is one machine's disk: a deployed build has no process to talk to
   and no disk to write, so the log would have quietly stopped persisting
   the moment the site left localhost.

   It lives in the visitor's own browser now. That is not a downgrade
   dressed up — it is the same claim the counter makes on screen. Nothing
   recorded means nothing leaves the device, and a transcript in localStorage
   is the only version of this that is literally true. It also survives a
   reload with no network at all, which the counter needs and a hosted
   database would not give.

   The seeding behaviour is deliberately the same as the old service: an
   empty store is filled with the nine sample turns on first read, so the
   Archive is never an empty screen on a first visit.

   Every function still returns `null` on failure and the callers still fall
   back the way they did, because storage can be absent — private windows,
   blocked site data — and a counter that throws because it cannot write a
   log is worse than one that does not write it.
   ============================================================ */

export type WireTurn = {
  id: string
  dir: 'in' | 'out'
  text: string
  glosses: string[]
  conf?: number
  repeated?: boolean
  textOnly?: boolean
  createdAt: string
}

export type NewTurn = Omit<WireTurn, 'id' | 'createdAt'>

const KEY = 'sanket.turns.v1'

export const formatAt = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toUpperCase()

export const toTurn = (w: WireTurn): Turn => ({
  id: w.id,
  dir: w.dir,
  at: formatAt(w.createdAt),
  text: w.text,
  glosses: w.glosses,
  conf: w.conf,
  repeated: w.repeated,
  textOnly: w.textOnly,
})

/* Oldest first — `ORDER BY created_at ASC`, as the service returned it, so
   the Counter's transcript still reads down the screen in the order the
   conversation happened. */
function read(): Turn[] | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) {
      write(SEED_TURNS)
      return SEED_TURNS
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Turn[]) : null
  } catch {
    return null
  }
}

function write(turns: Turn[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(turns))
    return true
  } catch {
    return false
  }
}

export async function fetchTurns(): Promise<Turn[] | null> {
  return read()
}

export async function createTurn(turn: NewTurn): Promise<Turn | null> {
  const list = read()
  if (list === null) return null

  const saved: Turn = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    dir: turn.dir,
    at: formatAt(new Date().toISOString()),
    text: turn.text,
    glosses: turn.glosses,
    conf: turn.conf,
    repeated: turn.repeated,
    textOnly: turn.textOnly,
  }

  return write([...list, saved]) ? saved : null
}

export async function clearTurns(): Promise<boolean> {
  try {
    localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
