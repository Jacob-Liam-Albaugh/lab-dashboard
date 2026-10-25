import { useEffect, useRef, useState } from 'react'
import { ExpandIcon, ExternalLinkIcon, PencilIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fileUrl, send, useJson, useText, useVersion } from '@/lib/api'
import { useDark } from '@/lib/palette'
import { parseRows } from '@/lib/parse'
import { href } from '@/lib/route'
import { DataTable } from './DataTable'
import { CapabilityMatrix } from './CapabilityMatrix'
import { LedgerView } from './LedgerView'
import { Code, dirname, Markdown } from './Markdown'
import { NpzView } from './NpzView'
import { PinButton, portal, togglePin, useFocus, usePins } from './Present'

const TEXT_HEAD = 512 * 1024
const BINARY = /^(png|jpe?g|gif|svg|webp|pdf|mp4|webm|mov|npz|npy|pt|pth|ckpt|h5|hdf5|pkl|pickle|nc|zip|gz|tar|bin|so|o|mat|parquet|feather|eqx)$/
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

const PINNABLE = 'section, table, figure, svg, canvas, img, pre, div[id]'

// runs inside the sandboxed page: hover pins for elements, or shows only the pinned element on a slide
const pinScript = (focus?: string) => `<script>(() => {
const focus = ${JSON.stringify(focus ?? null).replace(/</g, '\\u003c')}
const sel = (e) => {
  const p = []
  for (; e !== document.body; e = e.parentElement) {
    if (e.id) { p.unshift('#' + CSS.escape(e.id)); return p.join(' > ') }
    p.unshift(e.localName + ':nth-of-type(' + ([...e.parentElement.children].filter((c) => c.localName === e.localName).indexOf(e) + 1) + ')')
  }
  return 'body > ' + p.join(' > ')
}
if (focus) return addEventListener('load', () => {
  const el = document.querySelector(focus)
  if (!el) return void (document.body.textContent = 'Not found in this file.')
  for (let e = el; e !== document.body; e = e.parentElement) for (const s of e.parentElement.children) if (s !== e) s.style.display = 'none'
})
const b = document.createElement('button')
b.style.cssText = 'position:absolute;z-index:2147483647;display:none;font:12px system-ui;padding:2px 8px;border-radius:6px;border:1px solid #8888;background:Canvas;color:CanvasText;cursor:pointer'
document.documentElement.append(b)
let cur, pinned = []
const show = () => {
  b.textContent = pinned.includes(sel(cur)) ? 'Unpin' : 'Pin'
  const r = cur.getBoundingClientRect()
  b.style.display = ''
  b.style.top = scrollY + Math.max(r.top, 0) + 4 + 'px'
  b.style.left = scrollX + r.right - b.offsetWidth - 4 + 'px'
}
addEventListener('mouseover', (e) => {
  const el = !b.contains(e.target) && e.target.closest?.('${PINNABLE}')
  if (el && el !== cur) { cur = el; show() }
})
b.onclick = () => {
  const h = (cur.closest('section') ?? cur).querySelector('h1, h2, h3')?.textContent.trim()
  parent.postMessage({ pin: sel(cur), label: h ? (cur.localName === 'section' ? h : h + ' · ' + cur.localName) : cur.id || cur.localName }, '*')
}
addEventListener('message', (e) => { if (e.source === parent) { pinned = e.data.pinned; if (cur) show() } })
})()</script>`

// passes the page inline because some browsers and blockers refuse to load /api/ URLs in frames
function HtmlFile({ project, path, url }: { project: string; path: string; url: string }) {
  const { data, error } = useText(url)
  const theme = useDark() ? 'dark' : 'light'
  const focus = useFocus()
  const frame = useRef<HTMLIFrameElement>(null)
  const pinned = JSON.stringify(usePins().flatMap((p) => (p.project === project && p.path === path && p.part ? [p.part] : [])))
  const sync = () => frame.current?.contentWindow?.postMessage({ pinned: JSON.parse(pinned) }, '*')
  useEffect(sync, [pinned])
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && typeof e.data?.pin === 'string') {
        togglePin({ project, path, part: e.data.pin, title: `${path.split('/').pop()} · ${String(e.data.label).slice(0, 80)}` })
      }
    }
    addEventListener('message', on)
    return () => removeEventListener('message', on)
  }, [project, path])
  if (focus && focus.part === undefined) return null
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (data === undefined) return <Skeleton className="h-64" />
  const iframe = <iframe ref={frame} onLoad={sync} data-html-file srcDoc={data.replace(/<html\b/i, `<html data-theme="${theme}"`) + pinScript(focus?.part)} title={path}
    sandbox="allow-scripts" style={{ colorScheme: theme }} className="h-[calc(100svh-8.5rem)] w-full bg-background" />
  return focus ? portal(iframe, focus.target) : iframe
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
  if (path.split('/').at(-1) === 'capability-matrix.json') return <CapabilityMatrix project={project} path={path} />
  if (/^(png|jpe?g|gif|svg|webp)$/.test(e)) return <img src={url} alt={path} className="mx-auto max-h-[80vh] max-w-full rounded-md bg-white" />
  if (e === 'pdf') return <iframe src={url} title={path} className="h-[85vh] w-full rounded-md border" />
  if (/^(mp4|webm|mov)$/.test(e)) return <video src={url} controls loop className="mx-auto max-h-[80vh] max-w-full" />
  if (e === 'html') return <HtmlFile project={project} path={path} url={url} />
  if (e === 'npz' || e === 'npy') return <NpzView project={project} path={path} />
  if (e === 'ipynb') return <Notebook project={project} path={path} />
  if (e === 'md' || e === 'mdx') return <TextFile project={project} path={path} render={(t) => <Markdown text={t} project={project} dir={dirname(path)} path={path} />} />
  if (/^(csv|tsv|jsonl)$/.test(e)) return <TextFile project={project} path={path} render={(t) => <DataTable rows={parseRows(t, path)} project={project} base={dirname(path)} />} />
  if (BINARY.test(e)) {
    return <p className="text-sm text-muted-foreground">Binary file. <a className="underline" href={url} download>Download</a></p>
  }
  return <TextFile project={project} path={path} render={(t) => <Code text={t} lang={e} />} />
}

function Editor({ project, path, close }: { project: string; path: string; close: () => void }) {
  const { data, error } = useText(fileUrl(project, path))
  const [base, setBase] = useState<string>()
  const [text, setText] = useState('')
  if (data !== undefined && base === undefined) { setBase(data); setText(data) }
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (base === undefined) return <Skeleton className="h-64" />
  const save = () => send('PUT', fileUrl(project, path), { text, base }).then(() => { toast.success('Saved'); close() }, (e: Error) => toast.error(e.message))
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex-1">Editing · ⌘S to save</span>
        <Button variant="ghost" size="sm" onClick={() => (text === base || confirm('Discard your changes?')) && close()}>Cancel</Button>
        <Button size="sm" disabled={text === base} onClick={save}>Save</Button>
      </div>
      <Textarea autoFocus spellCheck={false} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save() } }}
        className="h-[calc(100svh-11rem)] resize-none font-mono text-xs leading-relaxed" />
    </div>
  )
}

export function FileView({ project, path, bare }: { project: string; path: string; bare?: boolean }) {
  const [editing, setEditing] = useState(false)
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
        {ext(path) === 'html' && <Button variant="ghost" size="icon-sm" aria-label="Fullscreen" title="Fullscreen" onClick={() => document.querySelector('iframe[data-html-file]')?.requestFullscreen()}><ExpandIcon /></Button>}
        {!editing && !BINARY.test(ext(path)) && <Button variant="ghost" size="icon-sm" aria-label="Edit file" title="Edit" onClick={() => setEditing(true)}><PencilIcon /></Button>}
        <PinButton pin={{ project, path, title: parts.at(-1)! }} />
        <Button variant="ghost" size="icon-sm" aria-label="Open raw file" nativeButton={false} render={<a href={fileUrl(project, path)} target="_blank" rel="noreferrer" />}><ExternalLinkIcon /></Button>
      </div>
      {editing ? <Editor key={path} project={project} path={path} close={() => setEditing(false)} /> : <FileBody project={project} path={path} />}
    </div>
  )
}
