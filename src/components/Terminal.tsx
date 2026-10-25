import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, PlusIcon, XIcon } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { store, stored } from '@/lib/api'
import { cn } from '@/lib/utils'

type Tab = { id: number; project?: string }

let nextId = 1
const ANSI = { red: '--chart-8', green: '--chart-6', yellow: '--chart-4', blue: '--chart-1', magenta: '--chart-5', cyan: '--chart-3' }

// paints each variable to a canvas pixel because xterm can't parse oklch or color-mix
function theme() {
  const css = getComputedStyle(document.documentElement)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  const rgba = (v: string, alpha = 1) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = css.getPropertyValue(v)
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return {
    background: rgba('--background'), foreground: rgba('--foreground'), cursor: rgba('--foreground'), cursorAccent: rgba('--background'),
    selectionBackground: rgba('--ring', 0.35), ...Object.fromEntries(Object.entries(ANSI).flatMap(([k, v]) => [[k, rgba(v)], [`bright${k[0].toUpperCase()}${k.slice(1)}`, rgba(v)]])),
  }
}

function Term({ project, active }: { project?: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const focus = useRef(() => {})
  useEffect(() => {
    const el = host.current!
    const family = getComputedStyle(el).fontFamily
    let live = true
    let dispose = () => {}
    // waits for the font so xterm measures the real cell width
    void document.fonts.load(`13px ${family}`).finally(() => {
      if (!live) return
      const term = new Terminal({ fontFamily: family, fontSize: 13, cursorBlink: true, theme: theme() })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(el)
      // skips hidden panels, where fit would shrink the pty to two columns
      const refit = () => { if (el.offsetWidth) fit.fit() }
      refit()
      const q = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows), ...(project && { p: project }) })
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/term?${q}`)
      const send = (m: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m))
      ws.onmessage = (e) => term.write(e.data)
      ws.onclose = () => term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n')
      term.onData((data) => send({ data }))
      term.onResize(({ cols, rows }) => send({ cols, rows }))
      const ro = new ResizeObserver(refit)
      ro.observe(el)
      const mo = new MutationObserver(() => { term.options.theme = theme() })
      mo.observe(document.documentElement, { attributeFilter: ['class', 'data-palette'] })
      focus.current = () => term.focus()
      term.focus()
      dispose = () => { ro.disconnect(); mo.disconnect(); ws.onclose = null; ws.close(); term.dispose() }
    })
    return () => { live = false; dispose() }
  }, [project])
  useEffect(() => { if (active) focus.current() }, [active])
  return <div ref={host} className="absolute inset-0 bg-background py-1 pl-2 font-mono" />
}

export function useTerminalOpen() {
  const [open, setOpen] = useState(() => stored('terminal.open', false))
  useEffect(() => store('terminal.open', open), [open])
  useEffect(() => {
    // listens in the capture phase so the shortcut also works while xterm has focus
    const key = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.code !== 'Backquote') return
      e.preventDefault()
      e.stopPropagation()
      setOpen((o) => !o)
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [])
  return [open, setOpen] as const
}

export function TerminalPanel({ project, open, onHide }: { project?: string; open: boolean; onHide: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState(0)
  const [height, setHeight] = useState(() => stored('terminal.height', 280))
  const add = () => {
    const id = nextId++
    setTabs((t) => [...t, { id, project }])
    setActive(id)
  }
  if (open && !tabs.length) add()
  const close = (id: number) => {
    const rest = tabs.filter((t) => t.id !== id)
    setTabs(rest)
    if (active === id) setActive(rest.at(-1)?.id ?? 0)
    if (!rest.length) onHide()
  }
  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const at = (y: number) => Math.round(Math.min(innerHeight - 120, Math.max(100, height + e.clientY - y)))
    const move = (m: PointerEvent) => setHeight(at(m.clientY))
    const up = (u: PointerEvent) => {
      store('terminal.height', at(u.clientY))
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
  }
  return (
    <div className={cn('relative flex shrink-0 flex-col border-t', !open && 'hidden')} style={{ height }}>
      <div className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" onPointerDown={drag} />
      <Tabs value={active} onValueChange={(v) => setActive(v as number)} className="min-h-0 flex-1 gap-0">
        <div className="flex items-center gap-1 border-b px-2">
          <TabsList variant="line">
            {tabs.map((t) => (
              <div key={t.id} className="flex items-center">
                <TabsTrigger value={t.id} className="font-mono text-xs">{t.project ?? '~'}</TabsTrigger>
                <Button variant="ghost" size="icon-xs" aria-label="Close terminal" onClick={() => close(t.id)}><XIcon /></Button>
              </div>
            ))}
          </TabsList>
          <Button variant="ghost" size="icon-xs" aria-label="New terminal" title="New terminal" onClick={add}><PlusIcon /></Button>
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Hide terminal" title="Hide (Ctrl+`)" onClick={onHide}><ChevronDownIcon /></Button>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} keepMounted className="relative min-h-0"><Term project={t.project} active={open && active === t.id} /></TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
