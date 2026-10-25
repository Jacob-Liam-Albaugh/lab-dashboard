import { useState } from 'react'
import { FileIcon, FolderIcon } from 'lucide-react'
import { CartesianGrid, ComposedChart, Area, Line, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { apiUrl, fileUrl, useJson, useText, useVersion, type Entry } from '@/lib/api'
import { metricNames, parseRows, reduceMetric, type Goal } from '@/lib/parse'
import { href } from '@/lib/route'
import { fmt, tooltipValue } from './Charts'
import { DataTable, StatusBadge } from './DataTable'
import { Markdown } from './Markdown'
import { Part, PinButton } from './Present'

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i

export function ImageGrid({ project, paths }: { project: string; paths: string[] }) {
  const v = useVersion()
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {paths.map((f) => (
        <a key={f} href={href({ view: 'file', project, path: f })} className="group space-y-1">
          <img src={fileUrl(project, f, v)} alt={f} loading="lazy" className="aspect-[4/3] w-full rounded-md border bg-white object-contain" />
          <span className="block truncate font-mono text-xs text-muted-foreground group-hover:underline">{f}</span>
        </a>
      ))}
    </div>
  )
}

type SweepData = { keys: string[]; points: { file: string; x: number; columns: ({ mean: number; lo: number; hi: number } | null)[] }[] }

function Sweep({ project, dir, files }: { project: string; dir: string; files: string[] }) {
  const [key, setKey] = useState<string | null>(null)
  const { data: probe } = useJson<SweepData>(apiUrl('sweep', { p: project, dir, key: '' }))
  const chosen = key ?? probe?.keys[0] ?? null
  const { data, error } = useJson<SweepData>(chosen ? apiUrl('sweep', { p: project, dir, key: chosen }) : null)
  const [col, setCol] = useState(0)
  const cols = Math.max(0, ...(data?.points.map((p) => p.columns.length) ?? [0]))
  const rows = data?.points.map((p) => ({ x: p.x, file: p.file, mean: p.columns[col]?.mean ?? null, band: p.columns[col] ? [p.columns[col]!.lo, p.columns[col]!.hi] : null })) ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sweep across {files.length} .npz files</CardTitle>
        <CardDescription>x is the first number in each filename; band is the 95% interval of the array.</CardDescription>
        <CardAction className="flex gap-2">
          {probe && (
            <Select value={chosen} onValueChange={(k) => { setKey(k as string); setCol(0) }}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{probe.keys.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {cols > 1 && (
            <Select value={String(col)} onValueChange={(c) => setCol(Number(c))}>
              <SelectTrigger size="sm"><SelectValue>{(c: string) => `column ${c}`}</SelectValue></SelectTrigger>
              <SelectContent>{Array.from({ length: cols }, (_, i) => <SelectItem key={i} value={String(i)}>column {i}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {error && <pre className="text-sm text-critical">{error}</pre>}
        {rows.length < 2 ? <p className="text-sm text-muted-foreground">Fewer than two files carry a number and this key.</p> : (
          <ChartContainer config={{ mean: { label: 'mean', color: 'var(--chart-1)' }, band: { label: '95% interval', color: 'var(--chart-1)' } }} className="h-64 w-full">
            <ComposedChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} fontSize={11} tickFormatter={fmt} />
              <YAxis tickLine={false} axisLine={false} width={56} fontSize={11} domain={['auto', 'auto']} tickFormatter={fmt} />
              <ChartTooltip content={<ChartTooltipContent formatter={tooltipValue({ mean: { label: 'mean' }, band: { label: '95% interval' } })} labelFormatter={(_, p) => p?.[0]?.payload?.file} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.2} isAnimationActive={false} />
              <Line dataKey="mean" stroke="var(--color-mean)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function Matrix({ project, dir }: { project: string; dir: string }) {
  const { data } = useJson<Record<string, Record<string, unknown>>>(apiUrl('jsondir', { p: project, dir }))
  const [metric, setMetric] = useState<string | null>(null)
  const [goal, setGoal] = useState<Goal>('min')
  if (!data) return null
  const rows = Object.keys(data).sort()
  const cols = [...new Set(rows.flatMap((r) => Object.keys(data[r])))].sort()
  if (rows.length * cols.length < 2) return null
  const names = metricNames(rows.flatMap((r) => Object.values(data[r])))
  const m = metric && names.includes(metric) ? metric : names[0]
  if (!m) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison matrix</CardTitle>
        <CardDescription>Each cell is the {goal === 'min' ? 'lowest' : 'highest'} {m} across that file's configs; shading ranks within a row, ★ marks the row winner.</CardDescription>
        <CardAction className="flex gap-2">
          <Select value={m} onValueChange={(v) => setMetric(v as string)}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>{names.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <Toggle size="sm" variant="outline" pressed={goal === 'min'} onPressedChange={(p) => setGoal(p ? 'min' : 'max')}>{goal === 'min' ? 'lower ↓' : 'higher ↑'}</Toggle>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-sm">
          <thead><tr><th />{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const vals = cols.map((c) => reduceMetric(data[r][c], m, goal))
              const finite = vals.filter((v): v is number => v !== null)
              const best = finite.length ? (goal === 'min' ? Math.min(...finite) : Math.max(...finite)) : null
              const [lo, hi] = [Math.min(...finite), Math.max(...finite)]
              return (
                <tr key={r}>
                  <th className="px-2 py-1 text-left font-medium">{r}</th>
                  {vals.map((v, j) => {
                    const t = v === null || hi === lo ? 0.5 : (goal === 'min' ? hi - v : v - lo) / (hi - lo)
                    return (
                      <td key={j} title={`${r} · ${cols[j]}: ${v ?? 'missing'}`} className="rounded-sm px-2 py-1 font-mono tabular-nums"
                        style={v === null ? undefined : { background: `color-mix(in oklab, var(--chart-1) ${Math.round(10 + t * 45)}%, transparent)` }}>
                        {v === null ? <span className="text-muted-foreground">—</span> : <span className={v === best ? 'font-semibold' : ''}>{v === best && '★ '}{fmt(v)}</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

type Status = { completion_ok?: boolean; completion_errors?: string[]; incomplete_targets?: string[]; next_action?: unknown; active_target?: string }

export function ReplicationView({ project, dir }: { project: string; dir: string }) {
  const p = (f: string) => join(dir, f)
  const { data: manifest } = useJson<{ paper_title?: string }>(fileUrl(project, p('paper_manifest.json')))
  const { data: status } = useJson<Status>(fileUrl(project, p('artifacts/status/status.json')))
  const { data: matrix } = useText(fileUrl(project, p('spec/reproduction_matrix.csv')))
  const { data: runs } = useText(fileUrl(project, p('artifacts/runs/run_index.jsonl')))
  const { data: report } = useJson<Entry[]>(apiUrl('tree', { p: project, dir: p('report') }))
  const targets = matrix ? parseRows(matrix, 'x.csv') : []
  const counts = Object.entries(targets.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status || 'UNSET']: (acc[t.status || 'UNSET'] ?? 0) + 1 }), {}))
  const pdf = report?.find((e) => e.name.endsWith('.pdf'))
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription className="font-mono">{dir || '.'}</CardDescription>
          <CardTitle>{manifest?.paper_title ?? 'Replication harness'}</CardTitle>
          <CardAction><PinButton pin={{ project, path: p('spec/reproduction_matrix.csv'), title: `${manifest?.paper_title ?? dir} · targets` }} /></CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          {status && <StatusBadge value={status.completion_ok ? 'complete' : 'incomplete'} />}
          {counts.map(([s, n]) => <span key={s} className="flex items-center gap-1"><StatusBadge value={s} /><span className="font-mono tabular-nums">{n}</span></span>)}
          {status?.active_target && status.active_target !== 'UNSET' && <Badge variant="secondary">active: {status.active_target}</Badge>}
          {pdf && <a className="ml-auto underline" href={href({ view: 'file', project, path: p(`report/${pdf.name}`) })}>report/{pdf.name}</a>}
        </CardContent>
        {!!status?.completion_errors?.length && <CardContent><ul className="list-disc pl-5 text-sm text-critical">{status.completion_errors.map((e) => <li key={e}>{e}</li>)}</ul></CardContent>}
      </Card>
      {targets.length > 0 && <section className="space-y-2"><h3 className="eyebrow text-muted-foreground">Reproduction targets</h3><DataTable rows={targets} project={project} base={dir} /></section>}
      {runs && <section className="space-y-2"><h3 className="eyebrow flex items-center text-muted-foreground">Run index<PinButton className="ml-auto" pin={{ project, path: p('artifacts/runs/run_index.jsonl'), title: `${manifest?.paper_title ?? dir} · run index` }} /></h3><DataTable rows={parseRows(runs, 'x.jsonl')} project={project} base={dir} /></section>}
    </div>
  )
}

export function FolderView({ project, dir }: { project: string; dir: string }) {
  const { data: entries, error } = useJson<Entry[]>(apiUrl('tree', { p: project, dir }))
  const readmeName = entries?.find((e) => /^readme\.md$/i.test(e.name))?.name
  const { data: readme } = useText(readmeName ? fileUrl(project, join(dir, readmeName)) : null)
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (!entries) return null
  const files = entries.filter((e) => !e.dir)
  const npz = files.filter((e) => e.name.endsWith('.npz')).map((e) => e.name)
  const images = files.filter((e) => IMAGE.test(e.name)).map((e) => join(dir, e.name))
  const hasJson = files.some((e) => e.name.endsWith('.json')) || entries.some((e) => e.dir)
  return (
    <div className="space-y-6">
      {entries.some((e) => e.name === 'paper_manifest.json') && <ReplicationView project={project} dir={dir} />}
      <div className="grid gap-x-6 gap-y-1 rounded-md border p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <a key={e.name} href={href({ view: e.dir ? 'dir' : 'file', project, path: join(dir, e.name) })} className="flex items-center gap-2 truncate hover:underline">
            {e.dir ? <FolderIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{e.name}</span>
            {!e.dir && <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{size(e.size)}</span>}
          </a>
        ))}
      </div>
      {npz.length >= 2 && <Part pin={{ project, path: dir, dir: true, part: 'sweep', title: `${dir || project} · sweep` }}><Sweep project={project} dir={dir} files={npz} /></Part>}
      {hasJson && <Part pin={{ project, path: dir, dir: true, part: 'matrix', title: `${dir || project} · comparison` }}><Matrix project={project} dir={dir} /></Part>}
      {images.length > 0 && <ImageGrid project={project} paths={images} />}
      {readme && <Markdown text={readme} project={project} dir={dir} path={join(dir, readmeName!)} />}
    </div>
  )
}

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1 << 20 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1 << 20)).toFixed(1)} MB`)
