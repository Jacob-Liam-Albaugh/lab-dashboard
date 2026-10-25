import { useState, type DragEvent } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Pin } from '@/lib/api'
import { columns, movePin, moveSlide, pinKey, removeAt, slides } from '@/lib/slides'
import { cn } from '@/lib/utils'

type Edge = 'left' | 'right' | 'top' | 'bottom'
type Drag = { pin: number } | { slide: number }
type Aim = { key: string; edge: Edge; next: Pin[] }

const line: Record<Edge, string> = {
  left: 'inset-y-0 -left-1 w-1', right: 'inset-y-0 -right-1 w-1',
  top: 'inset-x-0 -top-1 h-1', bottom: 'inset-x-0 -bottom-1 h-1',
}

function nearest(e: DragEvent, edges: Edge[]): Edge {
  const r = e.currentTarget.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y }
  return edges.reduce((a, b) => (d[b] < d[a] ? b : a))
}

// every slide as a miniature of its columns; drop a pin on a tile edge to put it beside or under that tile
export function SlideSorter({ pins, current, onPick, onChange }: { pins: Pin[]; current: number; onPick: (n: number) => void; onChange: (next: Pin[]) => void }) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [aim, setAim] = useState<Aim | null>(null)
  const end = () => { setDrag(null); setAim(null) }
  const start = (e: DragEvent, d: Drag) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
    // re-rendering inside dragstart can cancel the drag in Chrome
    setTimeout(() => setDrag(d))
  }
  const over = (e: DragEvent, key: string, edges: Edge[], to: (edge: Edge, d: Drag) => Pin[] | undefined) => {
    if (!drag) return
    const edge = nearest(e, edges)
    const next = to(edge, drag)
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    if (aim?.key !== key || aim.edge !== edge) setAim({ key, edge, next })
  }
  const mark = (key: string) => aim?.key === key && <span className={cn('pointer-events-none absolute rounded-full bg-primary', line[aim.edge])} />
  const dragged = (d: Drag) => drag && JSON.stringify(drag) === JSON.stringify(d)

  return (
    <div className="grid grid-cols-1 gap-4 overflow-y-auto px-4 pb-4 sm:grid-cols-2"
      onDrop={(e) => { e.preventDefault(); if (aim) onChange(aim.next); end() }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAim(null) }}>
      {slides(pins).map((s, n) => (
        <div key={pinKey(s[0].pin)} draggable onDragStart={(e) => start(e, { slide: n })} onDragEnd={end}
          onDragOver={(e) => over(e, `s${n}`, ['left', 'right'], (edge, d) => {
            const at = edge === 'left' ? n : n + 1
            return 'pin' in d ? movePin(pins, d.pin, { slide: at }) : moveSlide(pins, d.slide, at)
          })}
          className={cn('relative flex cursor-grab flex-col gap-1.5 rounded-lg border bg-card p-2', n === current && 'ring-2 ring-ring', dragged({ slide: n }) && 'opacity-40')}>
          <button className="text-left font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => onPick(n)}>{n + 1}</button>
          <div className="flex aspect-video gap-1.5">
            {columns(s).map((col, c) => (
              <div key={pinKey(col[0].pin)} className="flex min-w-0 flex-1 flex-col gap-1.5">
                {col.map(({ pin, i }, r) => (
                  <div key={pinKey(pin)} draggable onDragStart={(e) => start(e, { pin: i })} onDragEnd={end} onClick={() => onPick(n)}
                    onDragOver={(e) => over(e, `p${i}`, ['left', 'right', 'top', 'bottom'], (edge, d) => {
                      if (!('pin' in d)) return
                      if (edge === 'left' || edge === 'right') return movePin(pins, d.pin, { slide: n, column: edge === 'left' ? c : c + 1 })
                      return movePin(pins, d.pin, { slide: n, column: c, row: edge === 'top' ? r : r + 1 })
                    })}
                    className={cn('group/tile relative flex min-h-0 flex-1 items-start gap-1 rounded-md border bg-muted/50 p-1.5 text-xs', dragged({ pin: i }) && 'opacity-40')}>
                    <span className="line-clamp-3 flex-1 break-words">{pin.title}</span>
                    <Button variant="ghost" size="icon-xs" aria-label={`Remove ${pin.title}`} className="-m-1 opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onChange(removeAt(pins, i)) }}><XIcon /></Button>
                    {mark(`p${i}`)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {mark(`s${n}`)}
        </div>
      ))}
    </div>
  )
}
