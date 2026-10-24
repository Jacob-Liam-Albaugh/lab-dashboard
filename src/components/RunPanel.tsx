import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayIcon, SquareIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiUrl, send, useJson, type ProjectInfo, type RunMeta } from '@/lib/api'
import { StatusBadge } from './DataTable'
import { PinButton } from './Present'

const MAX_LOG = 400_000

function RunOutput({ id, onDone }: { id: string; onDone?: () => void }) {
  const [log, setLog] = useState('')
  const [meta, setMeta] = useState<RunMeta | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const es = new EventSource(apiUrl('run/stream', { id }))
    es.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.done) { setMeta(m.done); es.close(); onDone?.() }
      else setLog((l) => (l + m.text).slice(-MAX_LOG))
    }
    return () => es.close()
  }, [id, onDone])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [log])
  const kill = () => send('POST', apiUrl('run/kill', { id })).catch((e: Error) => toast.error(e.message))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">{meta?.cmd ?? id}</CardTitle>
        <CardDescription>{meta ? `exit ${meta.code} · ${meta.finished}` : 'running…'}</CardDescription>
        <CardAction>{!meta && <Button size="sm" variant="destructive" onClick={kill}><SquareIcon />Stop</Button>}</CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[45vh] rounded-md border bg-muted/40">
          <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{log}<div ref={end} /></pre>
        </ScrollArea>
        {meta && meta.figures.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {meta.figures.map((f) => (
              <figure key={f} className="space-y-1">
                <img src={apiUrl('run/figure', { id, name: f })} alt={f} className="w-full rounded-md border bg-white" />
                <figcaption className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                  {f}<PinButton pin={{ project: meta.project, path: f, run: id, title: `${meta.cmd} · ${f}` }} />
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function RunPanel({ project }: { project: string }) {
  const { data: info } = useJson<ProjectInfo>(apiUrl('project', { p: project }))
  const [tick, setTick] = useState(0)
  const { data: runs } = useJson<RunMeta[]>(apiUrl('runs', { p: project, t: tick }))
  const [cmd, setCmd] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const python = info?.usesUv ? 'uv run python' : 'python'
  const suggestions = [...(info?.makeTargets.map((t) => `make ${t}`) ?? []), ...(info?.scripts.map((s) => `${python} ${s}`) ?? [])]
  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const run: RunMeta = await send('POST', '/api/run', { p: project, cmd })
      setActive(run.id)
      refresh()
    } catch (err) { toast.error((err as Error).message) }
  }
  const shown = active ?? runs?.[0]?.id ?? null
  return (
    <div className="space-y-4">
      <form onSubmit={start} className="flex gap-2">
        <Input list="run-suggestions" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder={suggestions[0] ?? 'command to run in the project folder'} className="font-mono" />
        <datalist id="run-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <Button type="submit" disabled={!cmd.trim()}><PlayIcon />Run</Button>
      </form>
      <p className="text-xs text-muted-foreground">Runs in the project folder through your login shell. plt.show() figures are saved to the dashboard, not the project.</p>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <ol className="space-y-1">
          {runs?.map((r) => (
            <li key={r.id}>
              <button onClick={() => setActive(r.id)} className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${r.id === shown ? 'bg-muted' : ''}`}>
                <div className="truncate font-mono text-xs">{r.cmd}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge value={r.running ? 'running' : r.code === 0 ? 'success' : 'failed'} />
                  {new Date(r.started).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
          {runs?.length === 0 && <li className="text-sm text-muted-foreground">No runs yet.</li>}
        </ol>
        {shown && <RunOutput key={shown} id={shown} onDone={active ? refresh : undefined} />}
      </div>
    </div>
  )
}
