import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiUrl, useJson, useStored } from '@/lib/api'
import { BandChart, fmt, HistChart, SeriesChart } from './Charts'
import { Part } from './Present'

type Stats = { mean: number; sd: number; lo: number; hi: number; min: number; max: number } | null
type Hist = { counts: number[]; edges: number[] } | null
type Column = { stats: Stats; hist: Hist; x: number[]; y: (number | null)[]; ess: number | null }
type Chains = { stats: Stats; hist: Hist; rhat: number | null; ess: number | null; x: number[]; traces: (number | null)[][] }
type Band = { x: number[]; mean: (number | null)[]; lo: (number | null)[]; hi: (number | null)[] }
export type ArrayInfo = { name: string; shape: number[]; dtype: string } & (
  | { kind: 'scalar'; value: number | null }
  | { kind: 'other'; repr?: string | null }
  | { kind: 'columns'; columns: Column[] }
  | { kind: 'chains'; columns: Chains[] }
  | { kind: 'band'; columns: Band[] }
)
export function StatRow({ stats, extra }: { stats: Stats; extra?: React.ReactNode }) {
  if (!stats) return <p className="text-xs text-muted-foreground">No finite values.</p>
  const items: [string, string][] = [['mean', fmt(stats.mean)], ['sd', fmt(stats.sd)], ['95%', `${fmt(stats.lo)} – ${fmt(stats.hi)}`], ['range', `${fmt(stats.min)} – ${fmt(stats.max)}`]]
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {items.map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono tabular-nums">{v}</dd></div>)}
      {extra}
    </dl>
  )
}

const essItem = (ess: number | null) => ess !== null && <div className="flex gap-1.5"><dt className="text-muted-foreground">ESS</dt><dd className="font-mono tabular-nums">{Math.round(ess)}</dd></div>

function RhatBadge({ rhat }: { rhat: number | null }) {
  if (rhat === null) return null
  const ok = rhat < 1.01
  return <Badge variant="outline" className={ok ? 'border-good/40 text-good' : 'border-critical/40 text-critical'}>R̂ {rhat.toFixed(3)} {ok ? '✓' : '✗'}</Badge>
}

function ArrayCard({ a, id }: { a: ArrayInfo; id: string }) {
  const [col, setCol] = useStored(`${id}:col`, 0)
  const [view, setView] = useStored<'series' | 'hist'>(`${id}:view`, 'series')
  const cols = 'columns' in a ? a.columns.length : 0
  const header = (
    <CardHeader>
      <CardTitle className="font-mono">{a.name}</CardTitle>
      <CardDescription>{a.dtype} [{a.shape.join(' × ')}] · {a.kind}</CardDescription>
      {cols > 1 && (
        <CardAction>
          <Select value={String(col)} onValueChange={(v) => setCol(Number(v))}>
            <SelectTrigger size="sm"><SelectValue>{(v: string) => `column ${v}`}</SelectValue></SelectTrigger>
            <SelectContent>{Array.from({ length: cols }, (_, i) => <SelectItem key={i} value={String(i)}>column {i}</SelectItem>)}</SelectContent>
          </Select>
        </CardAction>
      )}
    </CardHeader>
  )
  let body: React.ReactNode
  if (a.kind === 'scalar') body = <p className="font-mono text-3xl tabular-nums">{fmt(a.value)}</p>
  else if (a.kind === 'other') body = <pre className="max-h-48 overflow-auto font-mono text-xs">{a.repr ?? 'Non-numeric array.'}</pre>
  else if (a.kind === 'band') {
    const b = a.columns[col]
    body = <BandChart x={b.x} mean={b.mean} lo={b.lo} hi={b.hi} />
  } else if (a.kind === 'chains') {
    const c = a.columns[col]
    body = (
      <div className="space-y-3">
        <StatRow stats={c.stats} extra={<>{essItem(c.ess)}<RhatBadge rhat={c.rhat} /></>} />
        <SeriesChart x={c.x} series={c.traces.map((y, i) => ({ label: `chain ${i}`, y }))} className="h-52 w-full" />
        {c.hist && <HistChart {...c.hist} className="h-36 w-full" />}
      </div>
    )
  } else {
    const c = a.columns[col]
    body = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <StatRow stats={c.stats} extra={essItem(c.ess)} />
          <Tabs value={view} onValueChange={(v) => setView(v as 'series' | 'hist')}>
            <TabsList><TabsTrigger value="series">Series</TabsTrigger><TabsTrigger value="hist">Histogram</TabsTrigger></TabsList>
          </Tabs>
        </div>
        {view === 'hist' && c.hist ? <HistChart {...c.hist} /> : <SeriesChart x={c.x} series={[{ label: a.name, y: c.y }]} />}
      </div>
    )
  }
  return <Card>{header}<CardContent>{body}</CardContent></Card>
}

export function NpzView({ project, path }: { project: string; path: string }) {
  const [mode, setMode] = useStored(`npz:${project}:${path}:mode`, 'auto')
  const { data, error } = useJson<ArrayInfo[]>(apiUrl('npz', { p: project, path, as: mode }))
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">2-D arrays as</span>
        <Tabs value={mode} onValueChange={(v) => setMode(v as string)}>
          <TabsList><TabsTrigger value="auto">Auto</TabsTrigger><TabsTrigger value="chains">Chains</TabsTrigger><TabsTrigger value="columns">Columns</TabsTrigger></TabsList>
        </Tabs>
      </div>
      {!data ? <Skeleton className="h-64" /> : <div className="grid gap-4 xl:grid-cols-2">{data.map((a) => <Part key={a.name} pin={{ project, path, part: `array:${a.name}`, title: `${path.split('/').pop()} · ${a.name}` }}><ArrayCard a={a} id={`npz:${project}:${path}:${a.name}`} /></Part>)}</div>}
    </div>
  )
}
