import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownIcon, ArrowUpIcon, Columns2Icon, ExpandIcon, MergeIcon, PinIcon, PinOffIcon, Rows2Icon, SplitIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { apiUrl, send, type Pin } from '@/lib/api'
import { navigate } from '@/lib/route'
import { columns, removeAt, setJoin, slides, splitOut, swap } from '@/lib/slides'
import { cn } from '@/lib/utils'
import { FileBody, FileView } from './FileView'
import { FolderView } from './FolderView'

let pins: Pin[] = []
const listeners = new Set<() => void>()
const loaded = fetch('/api/pins').then((r) => r.json()).then((p: Pin[]) => { pins = p; listeners.forEach((l) => l()) })

const same = (a: Pin, b: Pin) => a.project === b.project && a.path === b.path && a.run === b.run && a.section === b.section && a.part === b.part
const pinKey = (p: Pin) => `${p.project}:${p.run}:${p.path}:${p.section}:${p.part}`

const exit = () => (history.state?.inApp ? history.back() : navigate('/'))

export async function save(next: Pin[]) {
  await loaded
  pins = next
  listeners.forEach((l) => l())
  await send('PUT', '/api/pins', next).catch((e: Error) => toast.error(`Could not save pins: ${e.message}`))
}

export function togglePin(pin: Pin) {
  const i = pins.findIndex((p) => same(p, pin))
  return save(i >= 0 ? removeAt(pins, i) : [...pins, pin])
}

export const usePins = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => pins)

export function PinButton({ pin, className }: { pin: Pin; className?: string }) {
  const all = usePins()
  const pinned = all.some((p) => same(p, pin))
  return (
    <Button variant="ghost" size="icon-sm" aria-label={pinned ? 'Unpin from presentation' : 'Pin to presentation'} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Pin to presentation'}
      className={cn('text-muted-foreground', className, pinned && 'text-foreground opacity-100')}
      onClick={() => togglePin(pin)}>
      {pinned ? <PinOffIcon /> : <PinIcon />}
    </Button>
  )
}

type Focus = { part?: string; section?: string; target: HTMLElement }
const FocusContext = createContext<Focus | null>(null)
export const useFocus = () => useContext(FocusContext)
export const portal = (children: ReactNode, target: HTMLElement) => createPortal(<FocusContext.Provider value={null}>{children}</FocusContext.Provider>, target)

// marks a region pinnable on its own; on a slide focused on it, the region portals out of the hidden file view
export function Part({ pin, children, className }: { pin: Pin; children: ReactNode; className?: string }) {
  const focus = useFocus()
  if (focus) return focus.part !== undefined && focus.part === pin.part ? portal(<div className={className}>{children}</div>, focus.target) : null
  return (
    <div className={cn('group/part relative', className)}>
      {children}
      <PinButton pin={pin} className="absolute -top-3 -right-3 z-10 bg-background opacity-0 shadow-sm ring-1 ring-border group-hover/part:opacity-100 focus-visible:opacity-100" />
    </div>
  )
}

function Focused({ pin }: { pin: Pin }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const body = pin.dir ? <FolderView project={pin.project} dir={pin.path} /> : <FileBody project={pin.project} path={pin.path} />
  return (
    <>
      <div ref={setTarget} className="h-full empty:before:text-muted-foreground empty:before:content-['Not_found_in_this_file.']" />
      {target && <div hidden><FocusContext.Provider value={{ part: pin.part, section: pin.section, target }}>{body}</FocusContext.Provider></div>}
    </>
  )
}

function PinBody({ pin }: { pin: Pin }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto [&_iframe[data-html-file]]:h-full">
      {pin.run
        ? <img src={apiUrl('run/figure', { id: pin.run, name: pin.path })} alt={pin.title} className="mx-auto max-h-full rounded-md bg-white" />
        : pin.section !== undefined || pin.part !== undefined ? <Focused pin={pin} />
        : pin.dir ? <FolderView project={pin.project} dir={pin.path} />
        : <FileView project={pin.project} path={pin.path} bare />}
    </div>
  )
}

const source = (pin: Pin) => <p className="truncate font-mono text-xs text-muted-foreground">{pin.project} · {pin.path}</p>

function Slide({ slide }: { slide: { pin: Pin; i: number }[] }) {
  const pins = slide.map((x) => x.pin)
  if (pins.length === 1) return (
    <div className="flex h-full flex-col gap-3 px-10 py-6">
      <h2 className="text-2xl font-semibold">{pins[0].title}</h2>
      <PinBody pin={pins[0]} />
      {source(pins[0])}
    </div>
  )
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto px-10 py-6 md:flex-row">
      {columns(slide).map((col) => (
        // grid rows grow to their content until space runs out, so a short summary stays whole beside a tall chart
        <div key={pinKey(col[0].pin)} className={cn('grid min-h-64 min-w-0 flex-1 auto-rows-[minmax(0,auto)] gap-6 md:min-h-0', col.length > 1 && 'content-start')}>
          {col.map(({ pin: p }) => (
            <div key={pinKey(p)} className="flex min-h-0 flex-col gap-2">
              <h2 className="text-lg font-semibold">{p.title}</h2>
              <PinBody pin={p} />
              {source(p)}
            </div>
          ))}
        </div>
      ))}
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
    // merging slides shrinks the deck, which re-inits embla without a select
    api.on('select', on).on('reInit', on)
    return () => { api.off('select', on).off('reInit', on) }
  }, [api])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('[role=dialog]'))) exit()
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') api?.scrollNext()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') api?.scrollPrev()
      else if (e.key === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
      else return
      e.preventDefault()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [api])
  const deck = slides(all)
  if (!all.length) return <p className="p-8 text-muted-foreground">Nothing pinned yet. Use the pin button on any file, chart or run figure.</p>
  return (
    <div className="flex h-svh flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
        <span className="font-mono tabular-nums text-muted-foreground">{index + 1} / {deck.length}</span>
        <span className="truncate">{deck[index]?.map((x) => x.pin.title).join(' · ')}</span>
        <div className="ml-auto flex gap-1">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="sm">Slides</Button>} />
            <SheetContent>
              <SheetHeader><SheetTitle>Slides</SheetTitle></SheetHeader>
              <ol className="space-y-1 px-4">
                {deck.map((s, n) => s.map(({ pin: p, i }, k) => (
                  <li key={pinKey(p)} className={cn('flex items-center gap-1 text-sm', k > 0 && 'ml-4 border-l pl-2', p.join === 'below' && 'ml-8')}>
                    <button className="flex-1 truncate text-left hover:underline" onClick={() => api?.scrollTo(n)}>{k === 0 && `${n + 1}. `}{p.title}</button>
                    {k > 0 && (p.join === 'below'
                      ? <Button variant="ghost" size="icon-xs" aria-label="Put beside the pin above" title="Put beside the pin above" onClick={() => save(setJoin(all, i, true))}><Columns2Icon /></Button>
                      : <Button variant="ghost" size="icon-xs" aria-label="Stack under the pin above" title="Stack under the pin above" onClick={() => save(setJoin(all, i, 'below'))}><Rows2Icon /></Button>)}
                    {k > 0
                      ? <Button variant="ghost" size="icon-xs" aria-label="Split into its own slide" title="Split into its own slide" onClick={() => save(splitOut(all, i))}><SplitIcon /></Button>
                      : <Button variant="ghost" size="icon-xs" aria-label="Merge with previous slide" title="Merge with previous slide" disabled={n === 0} onClick={() => save(setJoin(all, i, true))}><MergeIcon /></Button>}
                    <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => save(swap(all, i, i - 1))}><ArrowUpIcon /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === all.length - 1} onClick={() => save(swap(all, i, i + 1))}><ArrowDownIcon /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => save(removeAt(all, i))}><XIcon /></Button>
                  </li>
                )))}
              </ol>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={() => document.documentElement.requestFullscreen()}><ExpandIcon />Fullscreen</Button>
          <Button variant="ghost" size="sm" onClick={exit}>Exit</Button>
        </div>
      </div>
      <Carousel setApi={setApi} className="relative min-h-0 flex-1" opts={{ watchDrag: false }}>
        <CarouselContent className="h-[calc(100svh-3rem)]">
          {deck.map((s) => <CarouselItem key={pinKey(s[0].pin)} className="h-full"><Slide slide={s} /></CarouselItem>)}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
    </div>
  )
}
