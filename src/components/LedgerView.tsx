import { useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, Scatter, XAxis, YAxis } from 'recharts'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Toggle } from '@/components/ui/toggle'
import { fileUrl, useText, useVersion, store, stored } from '@/lib/api'
import { guessScore, ledgerPoints, numericColumns, parseRows, type Goal, type LedgerPoint } from '@/lib/parse'
import { href } from '@/lib/route'
import { fmt } from './Charts'
import { DataTable, StatusBadge } from './DataTable'
import { PinButton } from './Present'

const config: ChartConfig = {
  keep: { label: 'kept', color: 'var(--chart-1)' },
  discard: { label: 'discarded', color: 'var(--muted-foreground)' },
  incumbent: { label: 'incumbent', color: 'var(--chart-2)' },
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader><CardDescription>{label}</CardDescription><CardTitle className="font-mono text-2xl tabular-nums">{value}</CardTitle></CardHeader>
      {sub && <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  )
}

function PointTip({ active, payload }: { active?: boolean; payload?: { payload: LedgerPoint }[] }) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  const desc = p.row.description ?? p.row.candidate ?? ''
  return (
    <div className="max-w-xs space-y-1 rounded-md border bg-background p-2 text-xs shadow-md">
      <div className="flex items-center gap-2"><span className="font-mono">{p.id}</span><StatusBadge value={p.status} /></div>
      <div className="font-mono tabular-nums">score {fmt(p.score)} · incumbent {fmt(p.incumbent)}</div>
      {desc && <p className="line-clamp-4 text-muted-foreground">{desc}</p>}
    </div>
  )
}

export function LedgerView({ project, path, images = [] }: { project: string; path: string; images?: string[] }) {
  const { data: text } = useText(fileUrl(project, path))
  const v = useVersion()
  const rows = useMemo(() => (text ? parseRows(text, path) : []), [text, path])
  const key = `ledger:${project}:${path}`
  const guess = guessScore(rows)
  const [choice, setChoice] = useState<{ column: string; goal: Goal } | null>(() => stored(key, null))
  const [selected, setSelected] = useState<number | null>(null)
  if (!text) return <Skeleton className="h-96" />
  const metric = choice && numericColumns(rows).includes(choice.column) ? choice : guess
  if (!metric) return <DataTable rows={rows} project={project} />
  const choose = (c: { column: string; goal: Goal }) => { setChoice(c); store(key, c) }
  const points = ledgerPoints(rows, metric.column, metric.goal)
  const scored = points.filter((p) => p.score !== null)
  const kept = points.filter((p) => p.status === 'keep')
  const crashed = points.filter((p) => p.status === 'crash').length
  const best = points.at(-1)?.incumbent ?? null
  const first = scored[0]?.score ?? null
  const gain = best !== null && first ? ((best - first) / Math.abs(first)) * 100 : null
  const sel = selected !== null ? points[selected] : null
  const artifacts = sel ? images.filter((f) => f.split('/').pop()!.startsWith(sel.id)) : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Experiments" value={points.length} sub={`${crashed} crashed or invalid`} />
        <Metric label="Kept" value={kept.length} sub={`${points.length ? Math.round((kept.length / points.length) * 100) : 0}% acceptance`} />
        <Metric label={`Incumbent ${metric.column}`} value={fmt(best)} sub={`${metric.goal === 'min' ? 'lower' : 'higher'} is better`} />
        <Metric label="Change vs first" value={gain === null ? '—' : `${gain > 0 ? '+' : ''}${gain.toFixed(1)}%`} sub={`from ${fmt(first)}`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{metric.column} by experiment</CardTitle>
          <CardDescription>{path}</CardDescription>
          <CardAction className="flex items-center gap-2">
            <Select value={metric.column} onValueChange={(c) => choose({ column: c as string, goal: metric.goal })}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{numericColumns(rows).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Toggle size="sm" variant="outline" pressed={metric.goal === 'min'} onPressedChange={(min) => choose({ column: metric.column, goal: min ? 'min' : 'max' })}>
              {metric.goal === 'min' ? 'lower ↓' : 'higher ↑'}
            </Toggle>
            <PinButton pin={{ project, path, title: `${project} · ${metric.column}` }} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="h-80 w-full">
            <ComposedChart data={points} margin={{ left: 4, right: 12, top: 8 }} onClick={(s) => s?.activeTooltipIndex != null && setSelected(Number(s.activeTooltipIndex))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="i" type="number" domain={[0, Math.max(points.length - 1, 1)]} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={64} fontSize={11} domain={['auto', 'auto']} tickFormatter={fmt} />
              <ChartTooltip content={<PointTip />} />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              <Scatter name="discard" data={points.filter((p) => p.status === 'discard')} dataKey="score" fill="var(--color-discard)" fillOpacity={0.45} isAnimationActive={false} />
              <Scatter name="keep" data={kept} dataKey="score" fill="var(--color-keep)" isAnimationActive={false} />
              <Line name="incumbent" dataKey="incumbent" type="stepAfter" stroke="var(--color-incumbent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
      {sel && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono">{sel.id}<StatusBadge value={sel.status} /></CardTitle>
            <CardDescription className="whitespace-pre-wrap">{sel.row.description ?? ''}</CardDescription>
          </CardHeader>
          {artifacts.length > 0 && (
            <CardContent className="grid gap-3 md:grid-cols-2">
              {artifacts.map((f) => (
                <a key={f} href={href({ view: 'file', project, path: f })}>
                  <img src={fileUrl(project, f, v)} alt={f} className="w-full rounded-md border bg-white" />
                  <span className="font-mono text-xs text-muted-foreground">{f}</span>
                </a>
              ))}
            </CardContent>
          )}
        </Card>
      )}
      <DataTable rows={rows} project={project} onRow={setSelected} highlight={selected ?? undefined} />
    </div>
  )
}
