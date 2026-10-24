export type Row = Record<string, string>

export function parseDelimited(text: string, sep = text.split('\n', 1)[0].includes('\t') ? '\t' : ','): Row[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '' && sep !== '\t') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [header = [], ...body] = rows.filter((r) => r.some((f) => f !== ''))
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])))
}

export function parseJsonl<T = Record<string, unknown>>(text: string): T[] {
  return text.split('\n').filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
}

export const isNumeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))

export function numericColumns(rows: Row[]): string[] {
  if (!rows.length) return []
  return Object.keys(rows[0]).filter((k) => rows.filter((r) => r[k] !== '').every((r) => isNumeric(r[k])) && rows.some((r) => r[k] !== ''))
}

export type Goal = 'min' | 'max'
export type LedgerPoint = { i: number; id: string; score: number | null; status: 'keep' | 'discard' | 'crash' | 'run'; incumbent: number | null; row: Row }

const ID_COLUMNS = ['tag', 'commit', 'attempt', 'id', 'run']
const KEEP = /^(keep|kept|accept(ed)?|retain(ed)?|selected|improved?)$/i
const CRASH = /^(crash(ed)?|fail(ed|ure)?|error)$/i

export function guessScore(rows: Row[]): { column: string; goal: Goal } | null {
  const nums = numericColumns(rows)
  const column = nums.find((c) => /^score$/i.test(c)) ?? nums.find((c) => !/time|memory|_s$|gb$|^timestamp/i.test(c)) ?? nums[0]
  if (!column) return null
  return { column, goal: /loss|err|l2|rmse|mse|nll|residual/i.test(column) ? 'min' : 'max' }
}

/** Follows recorded keep decisions when the ledger has a status column; otherwise the running best. */
export function ledgerPoints(rows: Row[], column: string, goal: Goal): LedgerPoint[] {
  const statusKey = Object.keys(rows[0] ?? {}).find((k) => /^(status|decision)$/i.test(k))
  const idKey = Object.keys(rows[0] ?? {}).find((k) => ID_COLUMNS.includes(k.toLowerCase()))
  const better = (a: number, b: number) => (goal === 'min' ? a < b : a > b)
  let incumbent: number | null = null
  return rows.map((row, i) => {
    const score = isNumeric(row[column] ?? '') ? Number(row[column]) : null
    const raw = statusKey ? row[statusKey] : ''
    let status: LedgerPoint['status']
    if (score === null || CRASH.test(raw) || /^false$/i.test(row.is_valid ?? '')) status = 'crash'
    else if (statusKey) status = KEEP.test(raw) ? 'keep' : 'discard'
    else status = incumbent === null || better(score, incumbent) ? 'keep' : 'discard'
    if (status === 'keep' && score !== null) incumbent = score
    return { i, id: idKey ? row[idKey] : String(i), score, status, incumbent, row }
  })
}

export function flattenNumbers(value: unknown, prefix = ''): [string, number][] {
  if (typeof value === 'number' && Number.isFinite(value)) return [[prefix, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => flattenNumbers(v, prefix ? `${prefix}.${k}` : k))
  }
  return []
}

export function reduceMetric(value: unknown, metric: string, goal: Goal): number | null {
  const hits = flattenNumbers(value).filter(([p]) => p === metric || p.endsWith(`.${metric}`)).map(([, v]) => v)
  if (!hits.length) return null
  return goal === 'min' ? Math.min(...hits) : Math.max(...hits)
}

export function metricNames(values: unknown[]): string[] {
  const rank = new Map<string, number>()
  for (const v of values) for (const [p] of flattenNumbers(v)) {
    const name = p.split('.').pop()!
    rank.set(name, (rank.get(name) ?? 0) + (/(^|\.)(metrics?|results?|scores?)\./i.test(p) ? 1e6 : 1))
  }
  return [...rank.keys()].sort((a, b) => rank.get(b)! - rank.get(a)! || a.localeCompare(b))
}

export function flattenRow(value: unknown, prefix = '', out: Row = {}): Row {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flattenRow(v, prefix ? `${prefix}.${k}` : k, out)
  } else out[prefix] = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return out
}

export const parseRows = (text: string, path: string): Row[] =>
  path.endsWith('.jsonl') ? normalize(parseJsonl(text).map((o) => flattenRow(o))) : parseDelimited(text, path.endsWith('.tsv') ? '\t' : ',')

/** Gives every row the union of keys so tables and column pickers see fields that appear late. */
function normalize(rows: Row[]): Row[] {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? ''])))
}
