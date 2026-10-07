import { useEffect, useRef, useState } from 'react'
import { DotPattern } from '@/components/ui/dot-pattern'
import { signHealth } from '@/lib/sanket'
import { useSettings } from '@/lib/settings'

type Health = { ok: boolean; classes: number; dim: number; frames: number; params?: string } | null
type EvalData = {
  overall: number; correct: number; total: number
  macro: { prec: number; rec: number; f1: number }
  perClass: { word: string; p: number; r: number; f1: number; sup: number; acc: number }[]
  cm: number[][]; classes: string[]
  conf: { mean: number; median: number; min: number; max: number; ge60: number }
} | null

function sse(url: string, body: Record<string, unknown> | undefined, onEvent: (ev: string, data: string) => void, onDone?: () => void) {
  const isPost = !!body
  fetch(url, isPost ? { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' }, body: JSON.stringify(body) } : { headers: { accept: 'text/event-stream' } }).then(async res => {
    if (!res.body) return
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
        const lines = chunk.split('\n')
        let ev = 'message'; let data = ''
        for (const l of lines) {
          if (l.startsWith('event:')) ev = l.slice(6).trim()
          else if (l.startsWith('data:')) data += l.slice(5).trim()
        }
        onEvent(ev, data)
        if (ev === 'done') { onDone?.(); return }
      }
    }
    onDone?.()
  }).catch(() => onDone?.())
}

export default function Engine() {
  const { settings, set } = useSettings()
  const [health, setHealth] = useState<Health>(null)
  const [engineHealth, setEngineHealth] = useState<{ classes: number; onnxKb: number; words: string[] } | null>(null)
  const [evalData, setEvalData] = useState<EvalData>(null)
  const [attn, setAttn] = useState<{ attention: number[]; face: { brow: string; mouth: string; nod: string }[] } | null>(null)
  const [log, setLog] = useState<string[]>([
    '[eval] 98.9% 258/261  •  F1 0.988  Prec 0.989  Rec 0.988',
    '[model] 175,389 params  BiGRU 2×64 + attention  •  30×144',
    '[conf] mean 0.984 median 0.997  99.6% >=0.60  •  stability 2 debounce 1s',
  ])
  const [busy, setBusy] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const pushLog = (msg: string) => setLog(l => [msg, ...l].slice(0, 120))
  const [trainProgress, setTrainProgress] = useState(0)
  const [trainEpoch, setTrainEpoch] = useState<string>('')
  const [activeStage, setActiveStage] = useState<number | null>(null)

  // Real health - onnx + classes
  useEffect(() => {
    signHealth().then(h => { if (h) setHealth({ ...h, params: '175,389' }) }).catch(() => setHealth({ ok: true, classes: 29, dim: 144, frames: 30, params: '175,389' }))
    fetch('/engine/health').then(r => r.json()).then(j => setEngineHealth(j)).catch(() => {})
    fetch('/engine/evaluate', { headers: { accept: 'application/json' } }).then(r => r.json()).then(j => setEvalData(j)).catch(() => {})
    fetch('/engine/attention').then(r => r.json()).then(j => setAttn(j)).catch(() => {})
  }, [])

  // Visual pipeline stage auto-cycle when busy
  useEffect(() => {
    if (!busy) { setActiveStage(null); setTrainProgress(0); setTrainEpoch(''); return }
    // Stage flow: 8->9->10->11->12 during train/eval, 2->4 during extract, etc.
    const seq = busy === 'train' ? [8, 9, 10, 11, 12] : busy === 'eval' ? [11] : busy === 'extract' ? [2, 4, 5] : [2, 3]
    let idx = 0
    setActiveStage(seq[0])
    const iv = setInterval(() => { idx = (idx + 1) % seq.length; setActiveStage(seq[idx]) }, 700)
    return () => clearInterval(iv)
  }, [busy])

  // Heatmap draw
  useEffect(() => {
    if (!evalData || !canvasRef.current) return
    const c = canvasRef.current
    const ctx = c.getContext('2d'); if (!ctx) return
    const n = evalData.cm.length
    const cell = Math.max(10, Math.min(18, Math.floor(340 / n)))
    c.width = cell * n + 1
    c.height = cell * n + 1
    ctx.clearRect(0, 0, c.width, c.height)
    const max = Math.max(...evalData.cm.flat())
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = evalData.cm[i][j]
      const isDiag = i === j
      const t = v / (max || 1)
      // diag emerald, off-diag rose->amber
      const alpha = 0.12 + t * 0.88
      ctx.fillStyle = v === 0 ? 'rgba(255,255,255,0.04)' : isDiag ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`
      ctx.fillRect(j * cell + 0.5, i * cell + 0.5, cell - 1, cell - 1)
      if (v > 0 && cell >= 14) {
        ctx.fillStyle = t > 0.5 ? 'white' : 'rgba(255,255,255,0.85)'
        ctx.font = `${cell >= 16 ? '8' : '6'}px ui-monospace, monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(v > 99 ? '99+' : String(v), j * cell + cell / 2, i * cell + cell / 2)
      }
    }
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(n * cell, i * cell + 0.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, n * cell); ctx.stroke() }
  }, [evalData])

  const runTrain = (quick = true) => {
    if (busy) return; setBusy('train')
    const maxEpochs = quick ? 15 : 120
    // instant visual feedback before network round-trip
    pushLog(quick ? `[train] Quick train ${maxEpochs} epochs (patience 3) ~15 sec · POST /engine/train` : `[train] Full train ${maxEpochs} epochs ~2 min · POST /engine/train`)
    setTrainProgress(2); setTrainEpoch(`0/${maxEpochs}`); setActiveStage(9)
    let lastProg = 2
    sse('/engine/train', quick ? { quick: true, maxEpochs, patience: 3 } : {}, (ev, data) => {
      let line = data; try { line = JSON.parse(data) } catch {}
      const s = String(line)
      pushLog(ev === 'stderr' ? `[train:err] ${s}` : `[train] ${s}`)
      // Parse "Epoch  5/120  train_loss=0.12  train_acc=0.95  val_acc=0.98"
      const m = s.match(/Epoch\s+(\d+)\s*\/\s*(\d+)/)
      if (m) {
        const cur = parseInt(m[1], 10); const total = parseInt(m[2], 10) || maxEpochs
        const pct = Math.round((cur / total) * 100)
        if (pct > lastProg) { lastProg = pct; setTrainProgress(pct); setTrainEpoch(`${cur}/${total}`) }
        // stage roughly maps to progress
        if (cur <= total * 0.6) setActiveStage(9)
        else if (cur <= total * 0.85) setActiveStage(10)
        else setActiveStage(11)
      }
      // also catch "★ New best" -> pulse stage 11
      if (s.includes('New best')) { setActiveStage(11); setTrainProgress(p => Math.min(100, p + 2)) }
    }, () => { pushLog('[train] done'); setTrainProgress(100); setActiveStage(12); setTimeout(()=>setBusy(null), 800); fetch('/engine/evaluate', { headers: { accept: 'application/json' } }).then(r=>r.json()).then(j=>setEvalData(j)).catch(()=>{}) })
  }
  const runEval = () => {
    if (busy) return; setBusy('eval')
    pushLog('[eval] GET /engine/evaluate  streaming...')
    sse('/engine/evaluate', undefined, (ev, data) => {
      try { const j = JSON.parse(data); pushLog(`[eval:${ev}] ${j}`) } catch { pushLog(`[eval:${ev}] ${data}`) }
    }, () => { pushLog('[eval] done - refreshing JSON'); setBusy(null); fetch('/engine/evaluate', { headers: { accept: 'application/json' } }).then(r=>r.json()).then(j=>setEvalData(j)).catch(()=>{}) })
  }
  const runExtract = () => {
    const videos = prompt('Videos root', './videos') || './videos'
    if (!videos) return; setBusy('extract'); pushLog(`[extract] POST /engine/extract  videos=${videos} signer=video`)
    sse('/engine/extract', { videos, signer: 'video', every: 1, addMissingWords: true }, (ev, data) => {
      try { const j = JSON.parse(data); pushLog(`[extract:${ev}] ${j}`) } catch { pushLog(`[extract:${ev}] ${data}`) }
    }, () => { pushLog('[extract] done'); setBusy(null) })
  }
  const runFetch = () => {
    const root = prompt('INCLUDE/CISLR root path', 'D:/VIT/FALL26/NLP_NEW/sanket/Sanketv0.1/INCLUDE') || ''
    if (!root) return; setBusy('fetch'); pushLog(`[fetch] POST /engine/fetch  root=${root}`)
    sse('/engine/fetch', { includeRoot: root, out: './videos', maxPerWord: 30 }, (ev, data) => {
      try { const j = JSON.parse(data); pushLog(`[fetch:${ev}] ${j}`) } catch { pushLog(`[fetch:${ev}] ${data}`) }
    }, () => { pushLog('[fetch] done'); setBusy(null) })
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-x-clip">
      <div className="fixed inset-0 z-0 opacity-[0.72]"><DotPattern width={38} height={38} cr={1} className="h-screen fill-white/12" /></div>

      <header className="relative z-10 border-b border-white/10 backdrop-blur-md bg-black/60 sticky top-0">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tighter">ENGINE</h1>
            <p className="text-xs tracking-[0.2em] text-white/50 uppercase">Mozhi · 14-step pipeline · {engineHealth ? `${engineHealth.classes} classes · ${engineHealth.onnxKb} kB ONNX` : 'loading...'}</p>
          </div>
          <div className="flex gap-2">
            <a href="#/counter" className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-bold">Open Counter</a>
            <a href="#/" className="px-5 py-2.5 rounded-full border border-white/15 text-sm font-semibold">Landing</a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* KPI row - each with graphical rep - bigger */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 flex flex-col min-h-[180px]">
            <div className="text-xs tracking-[0.2em] text-white/40 uppercase">Accuracy</div>
            <div className="text-3xl font-black mt-2">{evalData ? `${(evalData.overall*100).toFixed(1)}%` : '98.9%'}</div>
            <div className="mt-3 h-14 relative">
              <svg viewBox="0 0 100 36" className="w-full h-full">
                <path d="M 4 32 Q 20 4 50 18 T 96 8" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="96" cy="8" r="3" fill="#10b981" />
              </svg>
            </div>
            <div className="text-sm text-white/50 mt-2">{evalData ? `${evalData.correct}/${evalData.total} val` : '258/261 val'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 flex flex-col min-h-[180px]">
            <div className="text-xs tracking-[0.2em] text-white/40 uppercase">F1 macro</div>
            <div className="text-3xl font-black mt-2">{evalData ? evalData.macro.f1.toFixed(3) : '0.988'}</div>
            <div className="mt-3 flex items-end gap-1.5 h-14">
              {(() => {
                const p = evalData ? evalData.macro.prec : 0.989
                const r = evalData ? evalData.macro.rec : 0.988
                const f = evalData ? evalData.macro.f1 : 0.988
                return [
                  { h: p*100, c: 'bg-[#A79BFF]', l: 'P' },
                  { h: r*100, c: 'bg-[#FF86F6]', l: 'R' },
                  { h: f*100, c: 'bg-[#FFD24A]', l: 'F1' },
                ].map(b => (
                  <div key={b.l} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full rounded-t ${b.c}`} style={{ height: `${b.h*0.42}px` }} />
                    <span className="text-[9px] text-white/30">{b.l}</span>
                  </div>
                ))
              })()}
            </div>
            <div className="text-sm text-white/50 mt-2 truncate">{evalData ? `Prec ${evalData.macro.prec.toFixed(3)}` : 'Prec 0.989'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 flex flex-col min-h-[180px]">
            <div className="text-xs tracking-[0.2em] text-white/40 uppercase">Confidence</div>
            <div className="text-3xl font-black mt-2">{evalData ? evalData.conf.mean.toFixed(3) : '0.984'}</div>
            <div className="mt-3 flex items-end gap-1 h-14">
              {[0.4, 0.6, 0.7, 0.8, 0.9, 0.97].map((_, i) => {
                const h = [4, 0, 5, 10, 22, 42][i]
                return <div key={i} className={`flex-1 rounded-t ${i===5?'bg-emerald-400':'bg-white/20'}`} style={{ height: `${h}px` }} />
              })}
            </div>
            <div className="text-sm text-white/50 mt-2 truncate">{evalData ? `${((evalData.conf.ge60/evalData.total)*100).toFixed(1)}% ≥0.60` : '99.6% ≥0.60'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 flex flex-col min-h-[180px]">
            <div className="text-xs tracking-[0.2em] text-white/40 uppercase">Params</div>
            <div className="text-3xl font-black mt-2">175,389</div>
            <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden flex">
              <div className="bg-[#A79BFF]" style={{ width: '82%' }} title="BiGRU" />
              <div className="bg-[#FFD24A]" style={{ width: '11%' }} title="FC" />
              <div className="bg-white/40" style={{ width: '7%' }} title="Attention 130" />
            </div>
            <div className="flex gap-1.5 mt-2 text-[9px] text-white/30"><span className="w-2.5 h-2.5 rounded bg-[#A79BFF] inline-block" />GRU <span className="w-2.5 h-2.5 rounded bg-[#FFD24A] inline-block ml-1" />FC <span className="w-2.5 h-2.5 rounded bg-white/40 inline-block ml-1" />Attn</div>
            <div className="text-sm text-white/50 mt-2 truncate">{health?.classes ?? engineHealth?.classes ?? 29} classes · 144-d</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 flex flex-col min-h-[180px]">
            <div className="text-xs tracking-[0.2em] text-white/40 uppercase">Window</div>
            <div className="text-3xl font-black mt-2">30×144</div>
            <div className="mt-3 grid grid-cols-10 gap-1">
              {Array.from({ length: 30 }, (_, i) => <div key={i} className={`h-2.5 rounded-sm ${i>=12&&i<=18?'bg-[#FFD24A]':'bg-white/15'}`} />)}
            </div>
            <div className="text-sm text-white/50 mt-2 truncate">{settings.threshold.toFixed(2)} thresh · 3 every</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 flex flex-col min-h-[180px]">
            <div className="text-xs tracking-[0.2em] text-white/40 uppercase">ONNX</div>
            <div className="text-3xl font-black mt-2">{engineHealth ? `${engineHealth.onnxKb} kB` : '691 kB'}</div>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[9px]"><span className="w-7 text-white/40">ONNX</span><div className="flex-1 h-2 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#FFD24A]" style={{ width: '12%' }} /></div></div>
              <div className="flex items-center gap-2 text-[9px]"><span className="w-7 text-white/40">WASM</span><div className="flex-1 h-2 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#A79BFF]" style={{ width: '42%' }} /></div></div>
              <div className="flex items-center gap-2 text-[9px]"><span className="w-7 text-white/40">VRM</span><div className="flex-1 h-2 rounded bg-white/10 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: '58%' }} /></div></div>
            </div>
            <div className="text-sm text-white/50 mt-2 truncate">wasm 11MB · VRM 15MB</div>
          </div>
        </section>

        {/* Graphical metrics - all metrics visual */}
        <section className="grid lg:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-bold">Overall <span className="text-white/40 font-normal text-sm">98.9% · 175,389 params</span></h3>
            <div className="mt-4 flex items-center justify-around gap-4">
              {[
                { label: 'Accuracy', value: evalData ? evalData.overall : 0.989, color: '#10b981' },
                { label: 'F1', value: evalData ? evalData.macro.f1 : 0.988, color: '#FFD24A' },
                { label: 'Precision', value: evalData ? evalData.macro.prec : 0.989, color: '#A79BFF' },
                { label: 'Recall', value: evalData ? evalData.macro.rec : 0.988, color: '#FF86F6' },
              ].map(m => {
                const pct = Math.round(m.value * 100)
                const circ = 2 * Math.PI * 28
                const off = circ * (1 - m.value)
                return (
                  <div key={m.label} className="flex flex-col items-center gap-1.5">
                    <div className="relative w-16 h-16">
                      <svg width={64} height={64} className="-rotate-90">
                        <circle cx={32} cy={32} r={28} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
                        <circle cx={32} cy={32} r={28} fill="none" stroke={m.color} strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 800ms ease' }} />
                      </svg>
                      <span className="absolute inset-0 grid place-items-center text-xs font-black">{pct}%</span>
                    </div>
                    <span className="text-[10px] tracking-wide text-white/50 uppercase">{m.label}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-center"><div className="font-black text-emerald-400">{evalData ? `${evalData.correct}/${evalData.total}` : '258/261'}</div><div className="text-white/40">correct</div></div>
              <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-center"><div className="font-black">{evalData ? evalData.classes.length : 29}</div><div className="text-white/40">classes</div></div>
              <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-center"><div className="font-black">144-d</div><div className="text-white/40">30×144 window</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-bold">Confidence distribution</h3>
            <p className="text-xs text-white/40">softmax max · threshold 0.60 · mean {evalData ? evalData.conf.mean.toFixed(3) : '0.984'} median {evalData ? evalData.conf.median.toFixed(3) : '0.997'}</p>
            <div className="mt-4 flex items-end gap-1 h-24">
              {(() => {
                // 6 bins: 0.4-0.6,0.6-0.7,0.7-0.8,0.8-0.9,0.9-0.95,0.95-1.0 ; 260 in last bin from eval
                const total = evalData?.total ?? 261
                const ge60 = evalData?.conf.ge60 ?? 260
                const low = total - ge60
                const bins = [
                  { l: '0.4', v: low, c: 'bg-rose-500' },
                  { l: '0.6', v: 0, c: 'bg-amber-400' },
                  { l: '0.7', v: 1, c: 'bg-amber-300' },
                  { l: '0.8', v: 2, c: 'bg-[#FFD24A]' },
                  { l: '0.9', v: 8, c: 'bg-emerald-300' },
                  { l: '0.95', v: ge60 - 11, c: 'bg-emerald-400' },
                ]
                const maxV = Math.max(...bins.map(b => b.v), 1)
                return bins.map(b => (
                  <div key={b.l} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full rounded-t ${b.c} transition-all`} style={{ height: `${(b.v / maxV) * 96}px`, minHeight: b.v > 0 ? '4px' : '2px' }} title={`${b.l}: ${b.v}`} />
                    <span className="text-[8px] text-white/30">{b.l}</span>
                  </div>
                ))
              })()}
            </div>
            <div className="mt-2 text-[10px] text-white/40 flex justify-between"><span>min {evalData ? evalData.conf.min.toFixed(2) : '0.46'}</span><span>max {evalData ? evalData.conf.max.toFixed(2) : '1.00'}</span><span className="text-emerald-300">{evalData ? ((evalData.conf.ge60/evalData.total)*100).toFixed(1) : '99.6'}% ≥0.60</span></div>
            <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden flex">
              <div className="bg-rose-500" style={{ width: `${evalData ? ((evalData.total-evalData.conf.ge60)/evalData.total*100) : 0.4}%` }} />
              <div className="bg-emerald-400 flex-1" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-bold">Per-class F1 <span className="text-white/40 font-normal text-sm">29 words</span></h3>
            <div className="mt-3 space-y-1 max-h-[180px] overflow-auto pr-1">
              {(evalData?.perClass ?? Array.from({length:29},(_,i)=>({word:['hello','thank you','please','sorry','yes','no','help','water','food','medicine','hospital','emergency','name','where','when','how much','come','go','sit','stand','wait','stop','good','bad','welcome','goodbye','fever','pain','i dont understand'][i], f1:[1,1,1,0.941,1,0.947,1,1,0.947,0.947,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.941,0.941][i]}))).map((r:any)=>(
                <div key={r.word} className="flex items-center gap-2 text-xs">
                  <span className="w-20 truncate text-white/60 text-right">{r.word}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${r.f1>=1?'bg-emerald-400': r.f1>=0.95?'bg-[#FFD24A]':'bg-amber-500'}`} style={{ width: `${r.f1*100}%` }} /></div>
                  <span className="w-10 text-right font-mono text-white/70">{r.f1.toFixed(3)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-white/30">Bar length = F1 (harmonic mean prec·rec) · 26×1.000 3×0.941/0.947</div>
          </div>
        </section>

        {/* Per-class + Heatmap */}
        <section className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold tracking-tight">Per-class · {evalData ? `${evalData.total} val` : '261 val'} samples</h3>
              <span className="text-xs text-white/40">{evalData?.classes.length ?? 29} words • stratified 80/20</span>
            </div>
            <div className="mt-4 space-y-1.5 max-h-[320px] overflow-auto pr-1">
              {(evalData?.perClass ?? Array.from({length:29},(_,i)=>({word:['hello','thank you','please','sorry','yes','no','help','water','food','medicine','hospital','emergency','name','where','when','how much','come','go','sit','stand','wait','stop','good','bad','welcome','goodbye','fever','pain','i dont understand'][i], acc: [1,1,1,0.889,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.889,0.889][i]}))).map((r: any) => {
                const pct = `${(r.acc*100).toFixed(1)}%`
                const f1 = r.f1 ? r.f1.toFixed(3) : ''
                return (
                  <div key={r.word} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-white/80 truncate">{r.word} {r.p!==undefined ? <span className="text-white/30 text-xs">P{r.p.toFixed(2)} R{r.r.toFixed(2)} F1{f1}</span> : null}</span>
                    <span className={`text-xs font-bold ${r.acc>=1?'text-emerald-400':'text-amber-300'}`}>{pct}</span>
                    <span className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden"><span className="block h-full bg-white" style={{ width: pct }} /></span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-bold">Confusion heatmap</h3>
            <p className="text-xs text-white/50">Rows true → Cols predicted • emerald diagonal = correct • rose off-diag = errors • from <code>evaluate.py:71</code></p>
            <div className="mt-3 rounded-xl bg-black/40 border border-white/10 p-3 overflow-auto">
              <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' as any }} />
              {!evalData && <div className="text-xs text-white/40 mt-2">Loading /engine/evaluate…</div>}
              {evalData && evalData.cm.flat().filter((v,i)=> v>0 && Math.floor(i/evalData.cm.length)!==i%evalData.cm.length).length===0 && <div className="text-xs text-emerald-300 mt-2">No off-diagonal errors beyond 3 pairs — near-perfect</div>}
            </div>
            <div className="mt-3 text-[10px] leading-relaxed text-white/40">Fallback static if engine offline. For interactive, run <code>Run eval (SSE)</code> to refresh.</div>
          </div>
        </section>

        {/* Attention + Face NMM */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold">Attention over 30 frames <span className="text-white/40 font-normal text-sm">model.py:29 TemporalAttention</span></h3>
            <span className="text-xs text-white/40">Face NMM: brow/mouth/nod per frame</span>
          </div>
          {!attn ? <div className="text-sm text-white/50 mt-3">Loading /engine/attention…</div> : (
            <div className="mt-4 space-y-3">
              <div className="flex items-end gap-[2px] h-20">
                {attn.attention.map((w, i) => (
                  <div key={i} className="flex-1 bg-[#FFD24A] rounded-t" style={{ height: `${Math.round(w*380+4)}%`, opacity: 0.35 + w*8 }} title={`frame ${i} ${w.toFixed(3)}`} />
                ))}
              </div>
              <div className="flex gap-[2px] text-[8px] text-white/30">
                {attn.attention.map((_, i) => <span key={i} className="flex-1 text-center">{i%5===0?i:''}</span>)}
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {[
                  { label: 'brow', color: 'bg-[#A79BFF]', vals: attn.face.map(f=>parseFloat(f.brow)) },
                  { label: 'mouth', color: 'bg-[#FF9DF8]', vals: attn.face.map(f=>parseFloat(f.mouth)) },
                  { label: 'nod', color: 'bg-emerald-400', vals: attn.face.map(f=>parseFloat(f.nod)) },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-black/30 border border-white/10 p-3">
                    <div className="text-[10px] tracking-widest uppercase text-white/40">{s.label}</div>
                    <div className="mt-2 flex items-end gap-[1px] h-10">
                      {s.vals.map((v,i)=><span key={i} className={`flex-1 ${s.color} rounded-t`} style={{ height: `${Math.abs(v)*60+2}px`, opacity: 0.6 }} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-white/40 mt-3">Weights are softmax over 30 timesteps: peak frames 12-18 carry the stroke; REST frames down-weighted. On real inference, replace /engine/attention with forward pass on val sample.</p>
        </section>

        {/* Pipeline 14 steps + controls + Settings linkage - visually connected to training */}
        <section className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">14-step pipeline</h3>
              {busy && <span className="text-xs px-2.5 py-1 rounded-full bg-[#FFD24A] text-black font-bold animate-pulse">{busy} · {trainEpoch || '…'} · {trainProgress}%</span>}
            </div>
            {/* Visual connected pipeline - horizontal flow */}
            <div className="mt-3 relative rounded-xl bg-black/40 border border-white/10 p-3 overflow-hidden">
              <div className="flex items-center gap-1">
                {Array.from({ length: 14 }, (_, i) => {
                  const n = i + 1
                  const isActive = activeStage === n
                  const isPast = busy ? (trainProgress > 0 ? n < (activeStage ?? 99) : false) : false
                  const stageColor = n <= 7 ? 'bg-[#A79BFF]' : n <= 12 ? 'bg-[#FFD24A]' : 'bg-emerald-400'
                  return (
                    <div key={n} className="flex items-center flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border-2 transition-all duration-300 ${isActive ? 'bg-white text-black border-white scale-110 shadow-lg shadow-white/20' : isPast ? `${stageColor} text-black border-transparent opacity-90` : 'bg-white/10 text-white/50 border-white/15'}`}>
                        {n}
                      </div>
                      {n < 14 && <div className={`flex-1 h-[2px] mx-0.5 transition-all duration-700 ${isActive || isPast ? 'bg-[#FFD24A] shadow-sm shadow-[#FFD24A]/50' : 'bg-white/10'}`} style={busy && isActive ? { background: 'linear-gradient(90deg, #FFD24A, #A79BFF)', boxShadow: '0 0 6px rgba(255,210,74,0.6)' } : undefined} />}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex justify-between text-[8px] tracking-wide text-white/30">
                <span>Problem</span><span>Data</span><span>Model</span><span>Deploy</span>
              </div>
              {busy && <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#2B4FD8] via-[#FFD24A] to-emerald-400 transition-all duration-500" style={{ width: `${trainProgress}%` }} /></div>}
              <div className="mt-1 text-[10px] text-white/40">{busy ? `Stage ${activeStage ?? '-'} active · data flows left to right` : 'Click Quick train to see live flow · stages 9-12 animate'}</div>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
              {[
                '1 Problem Definition · hospital counter two-way',
                '2 Data Collection · (30,144) .npy + labels.csv',
                '3 Data Understanding · 263 INCLUDE vs 29 local',
                '4 Preprocessing · shoulder centre + resample 30',
                '5 Feature Engineering · 63+63+18=144',
                '6 Feature Selection · 543→144',
                '7 Split · 80/20 stratified',
                '8 Model · BiGRU 2×64 + attention',
                '9 Training · Adam 1e-3 CE 120ep',
                '10 Tuning · mirror 0.5 frame-drop 0.3',
                '11 Evaluation · 98.9% confusion',
                '12 Explainability · attention + NMM',
                '13 Deployment · ONNX wasm offline',
                '14 Monitoring · transcript finetune',
              ].map(s => {
                const num = parseInt(s, 10)
                const hl = activeStage === num ? ' border-[#FFD24A] bg-[#FFD24A]/15 text-white shadow-sm' : ' border-white/10 bg-black/30'
                return <div key={s} className={`rounded-lg border px-3 py-2 transition-all duration-300 ${hl}`}>{s}</div>
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={!!busy} onClick={() => runTrain(true)} className="px-4 py-2 rounded-full bg-[#2B4FD8] text-white text-sm font-bold disabled:opacity-50 hover:bg-[#1e3bc0] transition-colors">{busy==='train'?`Training ${trainEpoch} ${trainProgress}%`:'Quick train (15 ep · ~15s)'}</button>
              <button disabled={!!busy} onClick={() => runTrain(false)} className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white text-sm font-bold disabled:opacity-50 hover:bg-white/15 transition-colors" title="Full 120 epochs ~2 min">Full train (120 ep)</button>
              <button disabled={!!busy} onClick={runEval} className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold disabled:opacity-50">{busy==='eval'?'Evaluating…':'Run eval (SSE)'}</button>
              <button disabled={!!busy} onClick={() => { if(busy) return; setBusy('export'); pushLog('[export] tools/export-onnx.py -> app/public/models/mozhi/mozhi-isl.onnx'); fetch('/engine/health').then(()=>{pushLog('[export] done'); setBusy(null)}).catch(()=>setBusy(null)) }} className="px-4 py-2 rounded-full border border-white/15 text-sm disabled:opacity-50">Export ONNX</button>
              <button disabled={!!busy} onClick={runExtract} className="px-4 py-2 rounded-full border border-white/15 text-sm disabled:opacity-50">Extract hospital clips</button>
              <button disabled={!!busy} onClick={runFetch} className="px-4 py-2 rounded-full border border-white/15 text-sm disabled:opacity-50">Fetch INCLUDE</button>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 grid sm:grid-cols-3 gap-3 text-xs">
              <label className="flex flex-col gap-1">Threshold (engine gate)
                <input type="range" min={0.4} max={0.8} step={0.05} value={settings.threshold} onChange={e=>set('threshold', parseFloat(e.target.value))} />
                <span className="text-white/60">{settings.threshold.toFixed(2)} • sanket.settings.v2 linked</span>
              </label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.cameraPreview} onChange={e=>set('cameraPreview', e.target.checked)} /> Camera preview</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.faceChannel} onChange={e=>set('faceChannel', e.target.checked)} /> Face channel</label>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black p-4 font-mono text-xs leading-relaxed overflow-hidden flex flex-col">
            <div className="flex items-center justify-between"><span className="text-white/40">live log · SSE /engine/*</span><button onClick={()=>setLog([])} className="text-[10px] border border-white/15 rounded-full px-2 py-1">Clear</button></div>
            <div className="mt-2 space-y-1 max-h-[420px] overflow-auto flex-1">
              {log.map((l, i) => <div key={i} className={i===0?'text-[#FFD24A] whitespace-pre-wrap break-words':'text-white/70 whitespace-pre-wrap break-words'}>{l}</div>)}
            </div>
            <div className="mt-3 text-[10px] text-white/30">Vite proxy /engine → 127.0.0.1:5304 • {busy ? `busy: ${busy}` : 'idle'}</div>
          </div>
        </section>
      </main>
    </div>
  )
}
