import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export const color = (i: number) => `var(--chart-${(i % 8) + 1})`
export const fmt = (v: unknown) => {
  if (typeof v !== 'number') return String(v ?? '')
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5)) return v.toExponential(3)
  return Number(v.toPrecision(4)).toString()
}

const axis = { tickLine: false, axisLine: false, tickMargin: 6, fontSize: 11 } as const

export function SeriesChart({ x, series, logY, className = 'h-64 w-full' }: {
  x: (number | string)[]
  series: { label: string; y: (number | null)[] }[]
  logY?: boolean
  className?: string
}) {
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [`s${i}`, { label: s.label, color: color(i) }]))
  const data = x.map((xv, j) => Object.fromEntries([['x', xv], ...series.map((s, i) => [`s${i}`, s.y[j]])]))
  return (
    <ChartContainer config={config} className={className}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="x" {...axis} minTickGap={24} tickFormatter={fmt} />
        <YAxis {...axis} width={56} scale={logY ? 'log' : 'auto'} domain={['auto', 'auto']} tickFormatter={fmt} />
        <ChartTooltip content={<ChartTooltipContent formatter={tooltipValue(config)} labelFormatter={(_, p) => fmt(p?.[0]?.payload?.x)} />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((_, i) => <Line key={i} dataKey={`s${i}`} stroke={`var(--color-s${i})`} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />)}
      </LineChart>
    </ChartContainer>
  )
}

export function HistChart({ counts, edges, label = 'count', className = 'h-48 w-full' }: { counts: number[]; edges: number[]; label?: string; className?: string }) {
  const data = counts.map((c, i) => ({ x: (edges[i] + edges[i + 1]) / 2, c }))
  return (
    <ChartContainer config={{ c: { label, color: color(0) } }} className={className}>
      <BarChart data={data} barCategoryGap={1} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="x" {...axis} minTickGap={24} tickFormatter={fmt} />
        <YAxis {...axis} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => fmt(p?.[0]?.payload?.x)} />} />
        <Bar dataKey="c" fill="var(--color-c)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

export function BandChart({ x, mean, lo, hi, className = 'h-56 w-full' }: { x: number[]; mean: (number | null)[]; lo: (number | null)[]; hi: (number | null)[]; className?: string }) {
  const data = x.map((xv, j) => ({ x: xv, mean: mean[j], band: [lo[j], hi[j]] }))
  return (
    <ChartContainer config={{ mean: { label: 'mean', color: color(0) }, band: { label: '95% interval', color: color(0) } }} className={className}>
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="x" {...axis} minTickGap={24} />
        <YAxis {...axis} width={56} domain={['auto', 'auto']} tickFormatter={fmt} />
        <ChartTooltip content={<ChartTooltipContent formatter={tooltipValue({ mean: { label: 'mean' }, band: { label: '95% interval' } })} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.2} isAnimationActive={false} />
        <Line dataKey="mean" stroke="var(--color-mean)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  )
}

export const tooltipValue = (config: ChartConfig) => (value: unknown, name: unknown, item: { color?: string }) => {
  const shown = Array.isArray(value) ? value.map(fmt).join(' – ') : fmt(value)
  return (
    <div className="flex w-full items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
      <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
      <span className="ml-auto font-mono tabular-nums">{shown}</span>
    </div>
  )
}
