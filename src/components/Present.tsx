import { useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ExpandIcon, PinIcon, PinOffIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { apiUrl, send, type Pin } from '@/lib/api'
import { FileView } from './FileView'

let pins: Pin[] = []
const listeners = new Set<() => void>()
const loaded = fetch('/api/pins').then((r) => r.json()).then((p: Pin[]) => { pins = p; listeners.forEach((l) => l()) })

const same = (a: Pin, b: Pin) => a.project === b.project && a.path === b.path && a.run === b.run

async function save(next: Pin[]) {
  await loaded
  pins = next
  listeners.forEach((l) => l())
  await send('PUT', '/api/pins', next).catch((e: Error) => toast.error(`Could not save pins: ${e.message}`))
}

export const usePins = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => pins)

export function PinButton({ pin }: { pin: Pin }) {
  const all = usePins()
  const pinned = all.some((p) => same(p, pin))
  return (
    <Button variant="ghost" size="icon-sm" aria-label={pinned ? 'Unpin from presentation' : 'Pin to presentation'} title={pinned ? 'Unpin' : 'Pin to presentation'}
      onClick={() => save(pinned ? all.filter((p) => !same(p, pin)) : [...all, pin])}>
      {pinned ? <PinOffIcon /> : <PinIcon />}
    </Button>
  )
}

function Slide({ pin }: { pin: Pin }) {
  return (
    <div className="flex h-full flex-col gap-3 px-10 py-6">
      <h2 className="text-2xl font-semibold">{pin.title}</h2>
      <div className="min-h-0 flex-1 overflow-auto">
        {pin.run
          ? <img src={apiUrl('run/figure', { id: pin.run, name: pin.path })} alt={pin.title} className="mx-auto max-h-full rounded-md bg-white" />
          : <FileView project={pin.project} path={pin.path} bare />}
      </div>
      <p className="font-mono text-xs text-muted-foreground">{pin.project} · {pin.path}</p>
    </div>
  )
}

export function PresentView() {
  const all = usePins()
  const [api, setApi] = useState<CarouselApi>()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!api) return
    const on = () => setIndex(api.selectedScrollSnap())
    api.on('select', on)
    return () => { api.off('select', on) }
  }, [api])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') api?.scrollNext()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') api?.scrollPrev()
      else if (e.key === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
      else return
      e.preventDefault()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [api])
  const move = (i: number, d: number) => {
    const next = [...all]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    save(next)
  }
  if (!all.length) return <p className="p-8 text-muted-foreground">Nothing pinned yet. Use the pin button on any file, chart or run figure.</p>
  return (
    <div className="flex h-svh flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
        <span className="font-mono tabular-nums text-muted-foreground">{index + 1} / {all.length}</span>
        <span className="truncate">{all[index]?.title}</span>
        <div className="ml-auto flex gap-1">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="sm">Slides</Button>} />
            <SheetContent>
              <SheetHeader><SheetTitle>Slides</SheetTitle></SheetHeader>
              <ol className="space-y-1 px-4">
                {all.map((p, i) => (
                  <li key={`${p.project}:${p.run}:${p.path}`} className="flex items-center gap-1 text-sm">
                    <button className="flex-1 truncate text-left hover:underline" onClick={() => api?.scrollTo(i)}>{i + 1}. {p.title}</button>
                    <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpIcon /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === all.length - 1} onClick={() => move(i, 1)}><ArrowDownIcon /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => save(all.filter((_, j) => j !== i))}><XIcon /></Button>
                  </li>
                ))}
              </ol>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={() => document.documentElement.requestFullscreen()}><ExpandIcon />Fullscreen</Button>
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href="#/" />}>Exit</Button>
        </div>
      </div>
      <Carousel setApi={setApi} className="relative min-h-0 flex-1" opts={{ watchDrag: false }}>
        <CarouselContent className="h-[calc(100svh-3rem)]">
          {all.map((p) => <CarouselItem key={`${p.project}:${p.run}:${p.path}`} className="h-full"><Slide pin={p} /></CarouselItem>)}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
    </div>
  )
}
