import type { Turn } from './turns'
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

async function call<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      ...init,
      signal: abort.signal,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchTurns(): Promise<Turn[] | null> {
  const data = await call<{ turns: WireTurn[] }>('/api/turns')
  return data ? data.turns.map(toTurn) : null
}

export async function createTurn(turn: NewTurn): Promise<Turn | null> {
  const data = await call<{ turn: WireTurn }>('/api/turns', {
    method: 'POST',
    body: JSON.stringify(turn),
  })
  return data ? toTurn(data.turn) : null
}

export async function clearTurns(): Promise<boolean> {
  return (await call<{ cleared: boolean }>('/api/turns', { method: 'DELETE' })) !== null
}
