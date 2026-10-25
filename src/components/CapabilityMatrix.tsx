import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { fileUrl, store, stored, useJson, useStored } from '@/lib/api'
import { cn } from '@/lib/utils'
import { dirname, Markdown } from './Markdown'
import { Part } from './Present'

type Value = 'y' | 'p' | 'n' | 'nd' | '?' | 'na'
type Column = { group: string; key: string; label: string; desc: string; tested: string | null }
type Model = {
  name: string; by: string; kind: string; pinned?: boolean; gate?: string; gateReason?: string
  context: string; tokens: number; score: string
  values: Record<string, Value>; notes: Record<string, string>; details: Record<string, string>
}
type Matrix = { title: string; intro?: string; outro?: string; kinds: Record<string, string>; gates: Record<string, string>; columns: Column[]; rows: Model[] }

const MARK: Record<Value, { glyph: string; word: string; tone: string }> = {
  y: { glyph: '●', word: 'claimed', tone: 'text-chart-1' },
  p: { glyph: '◐', word: 'partial or sources conflict', tone: 'text-chart-4' },
  n: { glyph: '–', word: 'no', tone: 'text-muted-foreground/50' },
  nd: { glyph: '○', word: 'checked, not documented', tone: 'text-muted-foreground' },
  '?': { glyph: '?', word: 'not checked', tone: 'text-muted-foreground' },
  na: { glyph: '·', word: 'not applicable', tone: 'text-muted-foreground/50' },
}
const SORTS = { group: 'Grouped', most: 'Most capabilities', ctx: 'Longest context', name: 'Name' }
type Prefs = { kind: string; gate: string; sort: keyof typeof SORTS; partial: boolean; req: string[] }

const val = (m: Model, k: string): Value => m.values[k] ?? '?'
const score = (m: Matrix, row: Model) => m.columns.reduce((s, c) => s + ({ y: 1, p: 0.5 }[val(row, c.key) as string] ?? 0), 0)
const tally = (m: Matrix, k: string) => {
  const t: Record<Value, number> = { y: 0, p: 0, n: 0, nd: 0, '?': 0, na: 0 }
  m.rows.forEach((r) => t[val(r, k)]++)
  return t
}
const groups = (cols: Column[]) => [...new Set(cols.map((c) => c.group))].map((g) => ({ group: g, cols: cols.filter((c) => c.group === g) }))

function Mark({ v }: { v: Value }) {
  return <span className={cn('inline-block w-[1.2em] text-center font-mono font-medium', MARK[v].tone)}>{MARK[v].glyph}</span>
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[0.85rem] text-muted-foreground" aria-label="Legend">
      {(Object.keys(MARK) as Value[]).map((v) => <span key={v} className="inline-flex items-center gap-1.5"><Mark v={v} />{MARK[v].word}</span>)}
    </div>
  )
}

function Tested({ by }: { by: string | null }) {
  return by
    ? <span className="rounded-[3px] bg-hl px-1.5 py-px font-mono text-[0.72rem] whitespace-nowrap text-chart-1">tested by {by.split(' ').join(' · ')}</span>
    : <span className="rounded-[3px] border border-dashed border-chart-4 px-1.5 py-px font-mono text-[0.72rem] whitespace-nowrap text-chart-4">not tested</span>
}

function Space({ m }: { m: Matrix }) {
  const pct = (x: number) => `${(100 * x) / m.rows.length}%`
  return (
    <div className="grid gap-[22px]">
      {groups(m.columns).map(({ group, cols }) => (
        <div key={group} className="grid gap-1.5">
          <h3 className="eyebrow font-medium text-muted-foreground">{group}</h3>
          {cols.map((c) => {
            const t = tally(m, c.key)
            return (
              <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-3.5 gap-y-1 border-t py-[7px] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_9rem]">
                <div className="font-semibold">{c.label}</div>
                <div className="col-span-full row-start-2 min-w-0 text-[0.9rem] text-muted-foreground sm:col-span-1 sm:row-start-auto">
                  {c.desc} {c.tested !== null && <Tested by={c.tested} />}
                </div>
                <div>
                  <div className="flex h-2 overflow-hidden rounded-[2px] bg-muted" role="img" aria-label={`${t.y} claimed, ${t.p} partial, ${t.nd} not documented, ${t['?']} not checked of ${m.rows.length}`}>
                    <i className="bg-chart-1" style={{ width: pct(t.y) }} />
                    <i className="bg-chart-4" style={{ width: pct(t.p) }} />
                    <i className="bg-muted-foreground/45" style={{ width: pct(t.nd + t['?']) }} />
                  </div>
                  <p className="mt-[3px] font-mono text-xs text-muted-foreground tabular-nums">{t.y} ● · {t.p} ◐ · {t.nd} ○ · {t['?']} ?{t.na ? ` · ${t.na} ·` : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const cellBase = 'border-b bg-card'
const textCell = 'border-b border-l bg-card px-2.5 py-1.5 font-mono text-[0.76rem] whitespace-nowrap text-muted-foreground'
const pinCell = 'sticky top-(--hh) border-b-2 border-b-chart-1'

function ModelRow({ m, row, prefs, starts, open, onToggle }: { m: Matrix; row: Model; prefs: Prefs; starts: Set<string>; open: boolean; onToggle: () => void }) {
  const pin = row.pinned
  const hl = open && 'bg-hl'
  return (
    <>
      <tr className="group">
        <th scope="row" className={cn(cellBase, 'sticky left-0 z-[1] border-r p-0 text-left font-normal', pin && cn(pinCell, 'z-[3]'), hl)}>
          <button type="button" className="block w-36 px-2.5 py-1.5 text-left sm:w-[12.5rem]" aria-expanded={open} onClick={onToggle}>
            <span className="block font-semibold group-hover:text-chart-1">{row.name}</span>
            <span className="block text-xs text-muted-foreground">{row.by}{prefs.sort !== 'group' && !pin ? ` · ${m.kinds[row.kind] ?? row.kind}` : ''}</span>
            {pin && <span className="eyebrow block text-[0.66rem] text-chart-1">Pinned</span>}
            {row.gate && <span className="eyebrow block text-[0.66rem] text-chart-4">{m.gates[row.gate] ?? row.gate}</span>}
          </button>
        </th>
        {m.columns.map((c) => {
          const v = val(row, c.key), note = row.notes[c.key]
          return (
            <td key={c.key} title={`${c.label}: ${MARK[v].word}${note ? ` — ${note}` : ''}`}
              className={cn(cellBase, 'relative w-[1.9rem] min-w-[1.9rem] text-center', starts.has(c.key) && 'border-l', (prefs.req.includes(c.key) || open) && 'bg-hl', pin && cn(pinCell, 'z-[2]'))}>
              <Mark v={v} />
              {note && <span className="absolute top-[5px] right-[3px] size-[3px] rounded-full bg-muted-foreground" />}
            </td>
          )
        })}
        <td className={cn(textCell, pin && cn(pinCell, 'z-[2]'), hl)}>{row.context}</td>
        <td className={cn(textCell, pin && cn(pinCell, 'z-[2]'), hl)}>{row.score}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={m.columns.length + 3} className="border-b bg-background p-0">
            <dl className="sticky left-0 grid max-w-[min(58rem,88vw)] gap-x-2.5 gap-y-1 px-3.5 pt-3 pb-4 text-[0.85rem] sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              {[
                ...(row.gateReason ? [['Step 1', row.gateReason]] : []),
                ...m.columns.filter((c) => row.notes[c.key]).map((c) => [c.label, row.notes[c.key]]),
                ...Object.entries(row.details),
              ].map(([k, v]) => <Fragment key={k}><dt className="font-medium text-muted-foreground">{k}</dt><dd>{v}</dd></Fragment>)}
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}

function KindRow({ span, children }: { span: number; children: React.ReactNode }) {
  return <tr><td colSpan={span} className="border-b bg-background p-0"><span className="eyebrow sticky left-0 inline-block px-2.5 pt-3 pb-1 text-muted-foreground">{children}</span></td></tr>
}

function Grid({ m, project, head }: { m: Matrix; project: string; head: React.ReactNode }) {
  const key = `matrix:${project}`
  const [prefs, setPrefs] = useState<Prefs>(() => ({ kind: 'all', gate: 'all', sort: 'group', partial: false, req: [], ...stored<Partial<Prefs>>(key, {}) }))
  const [open, setOpen] = useStored<string[]>(`${key}:open`, [])
  const table = useRef<HTMLTableElement>(null)
  useLayoutEffect(() => {
    const t = table.current!
    const ro = new ResizeObserver(() => t.style.setProperty('--hh', `${t.tHead!.offsetHeight}px`))
    ro.observe(t.tHead!)
    return () => ro.disconnect()
  }, [])
  const set = (p: Partial<Prefs>) => setPrefs((old) => { const next = { ...old, ...p }; store(key, next); return next })
  const toggleOpen = (n: string) => setOpen(open.includes(n) ? open.filter((x) => x !== n) : [...open, n])
  const toggleReq = (k: string) => set({ req: prefs.req.includes(k) ? prefs.req.filter((r) => r !== k) : [...prefs.req, k] })

  const passes = (r: Model) =>
    (prefs.kind === 'all' || r.kind === prefs.kind)
    && (prefs.gate === 'all' || (r.gate ?? 'ok') === prefs.gate)
    && prefs.req.every((k) => val(r, k) === 'y' || (prefs.partial && val(r, k) === 'p'))
  const pinned = m.rows.filter((r) => r.pinned)
  const rows = m.rows.filter((r) => !r.pinned && passes(r))
  const by = { most: (a: Model, b: Model) => score(m, b) - score(m, a), ctx: (a: Model, b: Model) => b.tokens - a.tokens, name: (a: Model, b: Model) => a.name.localeCompare(b.name) }
  const sections = prefs.sort === 'group'
    ? Object.entries(m.kinds).map(([k, label]) => ({ label, rows: rows.filter((r) => r.kind === k) })).filter((s) => s.rows.length)
    : [{ label: '', rows: [...rows].sort(by[prefs.sort]) }]
  const gs = groups(m.columns)
  const starts = new Set(gs.map((g) => g.cols[0].key))
  const span = m.columns.length + 3
  const row = (r: Model) => <ModelRow key={r.name} m={m} row={r} prefs={prefs} starts={starts} open={open.includes(r.name)} onToggle={() => toggleOpen(r.name)} />
  const headText = 'sticky top-0 z-[4] border-b border-l bg-card px-2.5 py-2 text-left align-bottom text-[0.8rem] font-semibold whitespace-nowrap'

  return (
    <>
      <div className="col grid gap-3">
      {head}
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 text-[0.88rem]">
        <Tabs value={prefs.kind} onValueChange={(v) => set({ kind: String(v) })}>
          <TabsList aria-label="Model kind">{Object.entries({ all: 'All', ...m.kinds }).map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList>
        </Tabs>
        <Tabs value={prefs.gate} onValueChange={(v) => set({ gate: String(v) })}>
          <TabsList aria-label="Usable">{Object.entries({ all: 'All', ok: 'Usable', ...m.gates }).map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList>
        </Tabs>
        <Select items={SORTS} value={prefs.sort} onValueChange={(v) => set({ sort: v as Prefs['sort'] })}>
          <SelectTrigger size="sm" aria-label="Order"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Toggle size="sm" variant="outline" pressed={prefs.partial} onPressedChange={(partial) => set({ partial })}>Count ◐ as having it</Toggle>
        <span className="font-mono text-[0.78rem] text-muted-foreground">
          Showing {rows.length} of {m.rows.length - pinned.length} alternatives{pinned.length ? ` · ${pinned.map((r) => r.name).join(', ')} pinned` : ''}
          {prefs.req.length > 0 && ` · requiring ${prefs.req.map((k) => m.columns.find((c) => c.key === k)?.label).join(', ')}`}
        </span>
        {prefs.req.length > 0 && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => set({ req: [] })}>Clear required</Button>}
      </div>
      </div>
      <div className="max-h-[82vh] overflow-auto border bg-card">
        <table ref={table} className="border-separate border-spacing-0 text-[0.85rem] tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} className={cn(headText, 'left-0 z-[6] border-l-0')}>Model</th>
              {gs.map((g) => (
                <th key={g.group} colSpan={g.cols.length} className="eyebrow sticky top-0 z-[4] h-7 border-b border-l bg-card px-2 text-left text-[0.68rem] font-medium tracking-[0.06em] whitespace-nowrap text-muted-foreground">{g.group}</th>
              ))}
              <th rowSpan={2} className={headText}>Context</th>
              <th rowSpan={2} className={headText}>Best published score</th>
            </tr>
            <tr>
              {m.columns.map((c) => (
                <th key={c.key} className={cn('sticky top-7 z-[4] border-b bg-card p-0', starts.has(c.key) && 'border-l')}>
                  <button type="button" title={c.desc} aria-pressed={prefs.req.includes(c.key)} onClick={() => toggleReq(c.key)}
                    className="block h-[calc(8.6em+1rem)] w-full rotate-180 cursor-pointer px-1.5 py-2 text-left font-medium whitespace-nowrap [writing-mode:vertical-rl] hover:bg-hl aria-pressed:bg-chart-1 aria-pressed:text-card">
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pinned.map(row)}
            {sections.map((s) => (
              <Fragment key={s.label}>
                {s.label && <KindRow span={span}>{s.label} · {s.rows.length}</KindRow>}
                {s.rows.map(row)}
              </Fragment>
            ))}
            {!rows.length && <KindRow span={span}>No alternative claims all of the required capabilities.</KindRow>}
          </tbody>
          <tfoot className="font-mono text-[0.74rem] text-muted-foreground">
            <tr>
              <th className="sticky bottom-0 left-0 z-[3] border-t-2 bg-card px-2.5 py-1.5 text-left font-medium">Models claiming (of {m.rows.length})</th>
              {m.columns.map((c) => { const t = tally(m, c.key); return <td key={c.key} title={`${t.y} claimed, ${t.p} partial`} className="sticky bottom-0 z-[2] border-t-2 bg-card text-center">{t.y}</td> })}
              <td className="sticky bottom-0 z-[2] border-t-2 bg-card" /><td className="sticky bottom-0 z-[2] border-t-2 bg-card" />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

export function CapabilityMatrix({ project, path }: { project: string; path: string }) {
  const { data: m, error } = useJson<Matrix>(fileUrl(project, path))
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (!m) return <Skeleton className="h-96" />
  const md = (text: string) => <Markdown text={text} project={project} dir={dirname(path)} path={path} />
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-11">
      <div className="col grid gap-7">
        <section className="grid gap-3">
          <h2 className="text-[2rem] leading-tight">{m.title}</h2>
          {m.intro && md(m.intro)}
        </section>
        <Part pin={{ project, path, part: 'space', title: `${m.title} · capability space` }}><section className="grid gap-3.5">
          <h2 className="text-[1.35rem] leading-tight">Capability space</h2>
          <p className="max-w-[65ch] text-muted-foreground">Bars show how many of the {m.rows.length} models claim each capability. The tag shows which benchmarks exercise it.</p>
          <Legend />
          <Space m={m} />
        </section></Part>
      </div>
      <Part pin={{ project, path, part: 'grid', title: `${m.title} · model × capability` }} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Grid m={m} project={project} head={<>
          <h2 className="text-[1.35rem] leading-tight">Model × capability</h2>
          <p className="max-w-[65ch] text-muted-foreground">Click a column header to require that capability. Click a model name to see its notes. A small dot in a cell means there is a note.</p>
          <Legend />
        </>} />
      </Part>
      {m.outro && <section className="col">{md(m.outro)}</section>}
    </div>
  )
}
