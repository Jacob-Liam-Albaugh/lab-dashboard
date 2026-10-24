import { useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CircleDashedIcon, CircleIcon, MinusIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isNumeric, type Row } from '@/lib/parse'
import { href } from '@/lib/route'
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

export function DataTable({ rows, project, base = '', onRow, highlight }: {
  rows: Row[]
  project?: string
  base?: string
  onRow?: (i: number) => void
  highlight?: number
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows.</p>
  const keys = Object.keys(rows[0])
  const indexed = rows.map((r, i) => [r, i] as const)
  if (sort) {
    const num = indexed.every(([r]) => r[sort.key] === '' || isNumeric(r[sort.key]))
    indexed.sort(([a], [b]) => sort.dir * (num ? Number(a[sort.key] || NaN) - Number(b[sort.key] || NaN) || 0 : a[sort.key].localeCompare(b[sort.key])))
  }
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
    <div className="max-h-[70vh] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {keys.map((k) => (
              <TableHead key={k} className="cursor-pointer select-none whitespace-nowrap" onClick={() => setSort(sort?.key === k ? (sort.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 })}>
                {k}{sort?.key === k && (sort.dir === 1 ? <ArrowUpIcon className="ml-1 inline size-3" /> : <ArrowDownIcon className="ml-1 inline size-3" />)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {indexed.slice(0, MAX_ROWS).map(([r, i]) => (
            <TableRow key={i} data-state={highlight === i ? 'selected' : undefined} className={onRow ? 'cursor-pointer' : undefined} onClick={onRow && (() => onRow(i))}>
              {keys.map((k) => <TableCell key={k} className="align-top">{cell(k, r[k])}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > MAX_ROWS && <p className="p-2 text-xs text-muted-foreground">Showing {MAX_ROWS} of {rows.length} rows.</p>}
    </div>
  )
}
