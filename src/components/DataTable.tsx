import { useState, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronsUpDownIcon, CircleDashedIcon, CircleIcon, GripVerticalIcon, ListFilterIcon, MinusIcon, SearchIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isNumeric, type Row } from '@/lib/parse'
import { href } from '@/lib/route'
import { useStored } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmt } from './Charts'

const GOOD = /^(matched|keep|kept|success|ok|compared|generated|done|pass(ed)?|true|retain(ed)?|accept(ed)?)$/i
const BAD = /^(blocked|crash(ed)?|fail(ed|ure)?|error|false|reject(ed)?)$/i
const IDLE = /^(skipped|discard(ed)?|unset)$/i
const PATHLIKE = /^[\w.-]+(\/[\w.-]+)+\.\w{1,6}$/

export function StatusBadge({ value }: { value: string }) {
  if (GOOD.test(value)) return <Badge variant="outline" className="gap-1 border-good/30 bg-good/10 text-good"><CheckIcon />{value}</Badge>
  if (BAD.test(value)) return <Badge variant="outline" className="gap-1 border-critical/30 bg-critical/10 text-critical"><XIcon />{value}</Badge>
  if (IDLE.test(value)) return <Badge variant="outline" className="gap-1 text-muted-foreground"><MinusIcon />{value}</Badge>
  if (/^(active|running)$/i.test(value)) return <Badge variant="secondary" className="gap-1"><CircleIcon />{value}</Badge>
  return <Badge variant="outline" className="gap-1"><CircleDashedIcon />{value}</Badge>
}

const MAX_ROWS = 1000
const MAX_FACET = 20
const MAX_NUMERIC_FACET = 6
type Sort = { key: string; dir: 1 | -1 }

export function DataTable({ rows, project, base = '', onRow, highlight, render, id }: {
  rows: Row[]
  project?: string
  base?: string
  onRow?: (i: number) => void
  highlight?: number
  render?: (row: Row, key: string, i: number) => ReactNode
  id?: string
}) {
  const keys = Object.keys(rows[0] ?? {})
  const key = `table:${project}:${id ?? keys.join(',')}`
  const [sort, setSort] = useStored<Sort | null>(key, null)
  const [order, setOrder] = useStored<number[] | null>(`${key}:order`, null)
  const [query, setQuery] = useStored(`${key}:query`, '')
  const [filters, setFilters] = useStored<Record<string, string[]>>(`${key}:filters`, {})
  const [dragged, setDragged] = useState<number | null>(null)
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows.</p>

  const all = rows.map((_, i) => i)
  const kept = order?.filter((i) => i < rows.length) ?? []
  const ordered = [...kept, ...all.filter((i) => !kept.includes(i))]
  if (sort && keys.includes(sort.key)) {
    const num = rows.every((r) => r[sort.key] === '' || isNumeric(r[sort.key]))
    ordered.sort((a, b) => sort.dir * (num ? Number(rows[a][sort.key] || NaN) - Number(rows[b][sort.key] || NaN) || 0 : rows[a][sort.key].localeCompare(rows[b][sort.key])))
  }
  const q = query.trim().toLowerCase()
  const active = Object.entries(filters).filter(([k, vs]) => vs.length && keys.includes(k))
  const visible = ordered.filter((i) => active.every(([k, vs]) => vs.includes(rows[i][k])) && (!q || keys.some((k) => rows[i][k].toLowerCase().includes(q))))
  const facets = keys.flatMap((k) => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r[k], (counts.get(r[k]) ?? 0) + 1)
    const max = [...counts.keys()].every((v) => v === '' || isNumeric(v)) ? MAX_NUMERIC_FACET : MAX_FACET
    return counts.size > 1 && counts.size <= max && counts.size < rows.length ? [{ k, counts: [...counts].sort(([a], [b]) => a.localeCompare(b)) }] : []
  })
  const toggle = (k: string, v: string) => setFilters({ ...filters, [k]: filters[k]?.includes(v) ? filters[k].filter((x) => x !== v) : [...(filters[k] ?? []), v] })
  const move = (from: number, to: number) => {
    const next = ordered.filter((i) => i !== from)
    next.splice(next.indexOf(to) + (ordered.indexOf(from) < ordered.indexOf(to) ? 1 : 0), 0, from)
    setOrder(next)
    setSort(null)
  }
  const reset = () => { setSort(null); setOrder(null); setQuery(''); setFilters({}) }
  const nFilters = active.reduce((n, [, vs]) => n + vs.length, 0)

  const cell = (k: string, v: string) => {
    if (/^(status|decision)$/i.test(k) && v) return <StatusBadge value={v} />
    if (isNumeric(v)) return <span className="font-mono tabular-nums">{fmt(Number(v))}</span>
    if (project && PATHLIKE.test(v)) {
      const path = base ? `${base}/${v}` : v
      return <a className="font-mono text-xs underline underline-offset-2" href={href({ view: 'file', project, path })}>{v}</a>
    }
    return <span className="line-clamp-2 max-w-md" title={v}>{v}</span>
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-56">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput placeholder="Search rows…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        {facets.length > 0 && (
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" className="border-dashed" />}>
              <ListFilterIcon />Filter{nFilters > 0 && <Badge variant="secondary" className="rounded-sm px-1 font-mono">{nFilters}</Badge>}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <Command>
                <CommandInput placeholder="Filter values…" />
                <CommandList>
                  <CommandEmpty>No values.</CommandEmpty>
                  {facets.map(({ k, counts }) => (
                    <CommandGroup key={k} heading={k}>
                      {counts.map(([v, n]) => (
                        <CommandItem key={v} value={`${k} ${v}`} data-checked={!!filters[k]?.includes(v)} onSelect={() => toggle(k, v)}>
                          <span className="truncate">{v || '(empty)'}</span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">{n}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        {(sort || order || q || nFilters > 0) && <Button variant="ghost" size="sm" onClick={reset}>Reset<XIcon /></Button>}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{visible.length < rows.length && `${visible.length} of `}{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-md border [&>[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-6 px-1" />
              {keys.map((k) => (
                <TableHead key={k} className="group/head cursor-pointer select-none whitespace-nowrap" onClick={() => setSort(sort?.key === k ? (sort.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 })}>
                  {k}{sort?.key === k
                    ? (sort.dir === 1 ? <ArrowUpIcon className="ml-1 inline size-3" /> : <ArrowDownIcon className="ml-1 inline size-3" />)
                    : <ChevronsUpDownIcon className="ml-1 inline size-3 opacity-0 group-hover/head:opacity-50" />}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, MAX_ROWS).map((i) => (
              <TableRow key={i} data-state={highlight === i ? 'selected' : undefined}
                className={cn(onRow && 'cursor-pointer', dragged === i && 'opacity-40')}
                onClick={onRow && (() => onRow(i))}
                onDragOver={(e) => { if (dragged !== null) e.preventDefault() }}
                onDrop={(e) => { e.preventDefault(); if (dragged !== null && dragged !== i) move(dragged, i) }}>
                <TableCell className="w-6 px-1 align-top">
                  <span draggable title="Drag to reorder" className="flex cursor-grab text-muted-foreground/60 hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(e.currentTarget.closest('tr')!, 0, 0); setDragged(i) }}
                    onDragEnd={() => setDragged(null)}>
                    <GripVerticalIcon className="size-3.5" />
                  </span>
                </TableCell>
                {keys.map((k) => <TableCell key={k} className="align-top">{render ? render(rows[i], k, i) : cell(k, rows[i][k])}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length > MAX_ROWS && <p className="p-2 text-xs text-muted-foreground">Showing {MAX_ROWS} of {visible.length} rows.</p>}
      </div>
    </div>
  )
}
