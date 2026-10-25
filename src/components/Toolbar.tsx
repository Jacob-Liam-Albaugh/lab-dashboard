import { MonitorPlayIcon, PinIcon, PlayIcon, SquareTerminalIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import type { Pin } from '@/lib/api'
import { href, type Route } from '@/lib/route'
import { PinButton, usePins } from './Present'

const pinHref = (p: Pin) => href(p.run ? { view: 'runs', project: p.project } : { view: 'file', project: p.project, path: p.path })

function PinsMenu() {
  const pins = usePins()
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <PinIcon />Pinned{pins.length > 0 && <Badge variant="secondary">{pins.length}</Badge>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader><PopoverTitle>Pinned</PopoverTitle></PopoverHeader>
        {!pins.length && <p className="text-muted-foreground">Nothing pinned yet.</p>}
        <ul className="max-h-[60vh] space-y-0.5 overflow-auto">
          {pins.map((p) => (
            <li key={`${p.project}:${p.run}:${p.path}:${p.section}`} className="flex items-center gap-1">
              <a href={pinHref(p)} className="min-w-0 flex-1 truncate rounded-sm px-1 py-0.5 hover:bg-muted" title={`${p.project} · ${p.path}`}>{p.title}</a>
              <PinButton pin={p} />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function Toolbar({ route, terminal, onTerminal }: { route: Route; terminal: boolean; onTerminal: () => void }) {
  const project = 'project' in route ? route.project : undefined
  const where = [project, 'path' in route && route.path].filter(Boolean).join(' / ')
  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
      <SidebarTrigger />
      {where && <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" />}
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{where}</span>
      <div className="ml-auto flex items-center gap-1">
        {project && <Button variant="ghost" size="sm" nativeButton={false} render={<a href={href({ view: 'runs', project })} />}><PlayIcon />Runs</Button>}
        <PinsMenu />
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/present" />}><MonitorPlayIcon />Present</Button>
        <Button variant={terminal ? 'secondary' : 'ghost'} size="sm" aria-pressed={terminal} title="Toggle terminal (Ctrl+`)" onClick={onTerminal}><SquareTerminalIcon />Terminal</Button>
      </div>
    </header>
  )
}
