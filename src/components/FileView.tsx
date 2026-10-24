import { ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fileUrl, useJson, useText, useVersion } from '@/lib/api'
import { parseRows } from '@/lib/parse'
import { href } from '@/lib/route'
import { DataTable } from './DataTable'
import { LedgerView } from './LedgerView'
import { Code, dirname, Markdown } from './Markdown'
import { NpzView } from './NpzView'
import { PinButton } from './Present'

const TEXT_HEAD = 512 * 1024
const ext = (p: string) => (p.includes('.') ? p.split('.').pop()!.toLowerCase() : p.split('/').pop()!.toLowerCase())

export function isLedger(path: string) {
  return path.split('/').pop() === 'results.tsv' || path.endsWith('runs/ledger.jsonl')
}

function TextFile({ project, path, render }: { project: string; path: string; render: (text: string) => React.ReactNode }) {
  const { data, error } = useText(fileUrl(project, path) + `&head=${TEXT_HEAD}`)
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (data === undefined) return <Skeleton className="h-64" />
  return <>{render(data)}{data.length >= TEXT_HEAD && <p className="mt-2 text-xs text-muted-foreground">Showing the first 512 KB.</p>}</>
}

type Output = { output_type: string; text?: string | string[]; data?: Record<string, string | string[]>; traceback?: string[] }
type Cell = { cell_type: string; source: string | string[]; outputs?: Output[] }
const joined = (s: string | string[] | undefined) => (Array.isArray(s) ? s.join('') : (s ?? ''))
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

function Notebook({ project, path }: { project: string; path: string }) {
  const { data, error } = useJson<{ cells: Cell[]; metadata?: { language_info?: { name?: string } } }>(fileUrl(project, path))
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (!data) return <Skeleton className="h-64" />
  const lang = data.metadata?.language_info?.name === 'python' ? 'py' : data.metadata?.language_info?.name
  return (
    <div className="space-y-4">
      {data.cells.map((c, i) => c.cell_type === 'markdown'
        ? <Markdown key={i} text={joined(c.source)} project={project} dir={dirname(path)} />
        : c.cell_type === 'code' && (
          <div key={i} className="space-y-2">
            <Code text={joined(c.source)} lang={lang ?? 'py'} />
            {c.outputs?.map((o, j) => {
              const d = o.data ?? {}
              if (d['image/png']) return <img key={j} src={`data:image/png;base64,${joined(d['image/png'])}`} className="max-w-full rounded-md bg-white" />
              if (d['image/svg+xml']) return <img key={j} src={`data:image/svg+xml;utf8,${encodeURIComponent(joined(d['image/svg+xml']))}`} className="max-w-full rounded-md bg-white" />
              if (d['text/html']) return <iframe key={j} sandbox="" srcDoc={joined(d['text/html'])} className="h-64 w-full rounded-md border bg-white" />
              const text = o.traceback ? stripAnsi(o.traceback.join('\n')) : joined(o.text ?? d['text/plain'])
              return text && <pre key={j} className={`max-h-80 overflow-auto rounded-md p-2 font-mono text-xs ${o.traceback ? 'text-critical' : 'text-muted-foreground'}`}>{text}</pre>
            })}
          </div>
        ))}
    </div>
  )
}

export function FileBody({ project, path }: { project: string; path: string }) {
  const v = useVersion()
  const url = fileUrl(project, path, v)
  const e = ext(path)
  if (isLedger(path)) return <LedgerView project={project} path={path} />
  if (/^(png|jpe?g|gif|svg|webp)$/.test(e)) return <img src={url} alt={path} className="mx-auto max-h-[80vh] max-w-full rounded-md bg-white" />
  if (e === 'pdf') return <iframe src={url} title={path} className="h-[85vh] w-full rounded-md border" />
  if (/^(mp4|webm|mov)$/.test(e)) return <video src={url} controls loop className="mx-auto max-h-[80vh] max-w-full" />
  if (e === 'html') return <iframe src={url} title={path} sandbox="allow-scripts" className="h-[85vh] w-full rounded-md border bg-white" />
  if (e === 'npz' || e === 'npy') return <NpzView project={project} path={path} />
  if (e === 'ipynb') return <Notebook project={project} path={path} />
  if (e === 'md' || e === 'mdx') return <TextFile project={project} path={path} render={(t) => <Markdown text={t} project={project} dir={dirname(path)} path={path} />} />
  if (/^(csv|tsv|jsonl)$/.test(e)) return <TextFile project={project} path={path} render={(t) => <DataTable rows={parseRows(t, path)} project={project} base={dirname(path)} />} />
  if (/^(pt|pth|ckpt|h5|hdf5|pkl|pickle|nc|zip|gz|tar|bin|so|o|mat|parquet|feather|eqx)$/.test(e)) {
    return <p className="text-sm text-muted-foreground">Binary file. <a className="underline" href={url} download>Download</a></p>
  }
  return <TextFile project={project} path={path} render={(t) => <Code text={t} lang={e} />} />
}

export function FileView({ project, path, bare }: { project: string; path: string; bare?: boolean }) {
  if (bare) return <FileBody project={project} path={path} />
  const parts = path.split('/')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <nav className="min-w-0 flex-1 truncate font-mono text-sm">
          <a className="text-muted-foreground hover:underline" href={href({ view: 'project', project })}>{project}</a>
          {parts.map((s, i) => (
            <span key={i}>
              <span className="text-muted-foreground"> / </span>
              {i === parts.length - 1 ? s : <a className="text-muted-foreground hover:underline" href={href({ view: 'dir', project, path: parts.slice(0, i + 1).join('/') })}>{s}</a>}
            </span>
          ))}
        </nav>
        <PinButton pin={{ project, path, title: parts.at(-1)! }} />
        <Button variant="ghost" size="icon-sm" aria-label="Open raw file" nativeButton={false} render={<a href={fileUrl(project, path)} target="_blank" rel="noreferrer" />}><ExternalLinkIcon /></Button>
      </div>
      <FileBody project={project} path={path} />
    </div>
  )
}
