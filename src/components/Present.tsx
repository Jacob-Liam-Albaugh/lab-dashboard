import { useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ExpandIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { apiUrl, fileUrl, send, useText, useVersion, type Pin } from '@/lib/api'
import { markdownSection } from '@/lib/parse'
import { cn } from '@/lib/utils'
import { FileView } from './FileView'
import { dirname, Markdown } from './Markdown'

let pins: Pin[] = []
const listeners = new Set<() => void>()
const loaded = fetch('/api/pins').then((r) => r.json()).then((p: Pin[]) => { pins = p; listeners.forEach((l) => l()) })

const same = (a: Pin, b: Pin) => a.project === b.project && a.path === b.path && a.run === b.run && a.section === b.section
const pinKey = (p: Pin) => `${p.project}:${p.run}:${p.path}:${p.section}`

async function save(next: Pin[]) {
  await loaded
  pins = next
  listeners.forEach((l) => l())
  await send('PUT', '/api/pins', next).catch((e: Error) => toast.error(`Could not save pins: ${e.message}`))
}

export const usePins = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => pins)

function PinMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
      <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" fill="currentColor" />
      <path d="M19 19L17.5 17.5" />
      <path d="M15.5 15.5L14.5 14.5" />
    </svg>
  )
}

export function PinButton({ pin, className }: { pin: Pin; className?: string }) {
  const all = usePins()
  const pinned = all.some((p) => same(p, pin))
  return (
    <Button variant="ghost" size="icon-sm" aria-label={pinned ? 'Unpin from presentation' : 'Pin to presentation'} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Pin to presentation'}
      className={cn('text-muted-foreground', className, pinned && 'text-foreground opacity-100')}
      onClick={() => save(pinned ? all.filter((p) => !same(p, pin)) : [...all, pin])}>
      <PinMark />
    </Button>
  )
}

function SectionSlide({ pin }: { pin: Pin & { section: string } }) {
  const v = useVersion()
  const { data, error } = useText(fileUrl(pin.project, pin.path, v))
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (data === undefined) return <Skeleton className="h-64" />
  const body = markdownSection(data, pin.section)
  if (body === null) return <p className="text-muted-foreground">Section “{pin.section}” is no longer in {pin.path}.</p>
  return <Markdown text={body} project={pin.project} dir={dirname(pin.path)} />
}

function Slide({ pin }: { pin: Pin }) {
  return (
    <div className="flex h-full flex-col gap-3 px-10 py-6">
      <h2 className="text-2xl font-semibold">{pin.title}</h2>
      <div className="min-h-0 flex-1 overflow-auto">
        {pin.section
          ? <SectionSlide pin={{ ...pin, section: pin.section }} />
          : pin.run
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
      if (e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('[role=dialog]'))) location.hash = '#/'
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
                  <li key={pinKey(p)} className="flex items-center gap-1 text-sm">
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
          {all.map((p) => <CarouselItem key={pinKey(p)} className="h-full"><Slide pin={p} /></CarouselItem>)}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
    </div>
  )
}
