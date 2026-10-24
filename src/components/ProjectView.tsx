import { useState } from 'react'
import { BookOpenIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiUrl, fileUrl, useJson, useText, type ProjectInfo } from '@/lib/api'
import { href } from '@/lib/route'
import { LedgerView } from './LedgerView'
import { dirname, Markdown } from './Markdown'

function HarnessCard({ project, dir }: { project: string; dir: string }) {
  const { data } = useJson<{ paper_title?: string }>(fileUrl(project, dir ? `${dir}/paper_manifest.json` : 'paper_manifest.json'))
  return (
    <a href={href({ view: 'dir', project, path: dir })}>
      <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardDescription className="font-mono">{dir || '.'}</CardDescription>
          <CardTitle className="line-clamp-2 flex gap-2"><BookOpenIcon className="size-4 shrink-0" />{data?.paper_title ?? 'Replication harness'}</CardTitle>
        </CardHeader>
      </Card>
    </a>
  )
}

export function ProjectView({ project }: { project: string }) {
  const { data: info, error } = useJson<ProjectInfo>(apiUrl('project', { p: project }))
  const { data: readme } = useText(info?.readme ? fileUrl(project, info.readme) : null)
  const [ledger, setLedger] = useState(0)
  if (error) return <pre className="text-sm text-critical">{error}</pre>
  if (!info) return <Skeleton className="h-96" />
  const current = info.ledgers[Math.min(ledger, info.ledgers.length - 1)]
  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{info.name}</h1>
          <p className="truncate font-mono text-xs text-muted-foreground">{info.root}</p>
        </div>
        <Button variant="outline" nativeButton={false} render={<a href={href({ view: 'runs', project })} />}><PlayIcon />Run</Button>
      </header>
      {current && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-medium">Autoresearch</h2>
            {info.ledgers.length > 1 && (
              <Tabs value={String(ledger)} onValueChange={(v) => setLedger(Number(v))}>
                <TabsList>{info.ledgers.map((l, i) => <TabsTrigger key={l} value={String(i)}>{dirname(l) || '.'}</TabsTrigger>)}</TabsList>
              </Tabs>
            )}
          </div>
          <LedgerView key={current} project={project} path={current} images={info.images} />
        </section>
      )}
      {info.harnesses.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Paper replications</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{info.harnesses.map((d) => <HarnessCard key={d} project={project} dir={d} />)}</div>
        </section>
      )}
      {readme && <section><Markdown text={readme} project={project} dir={dirname(info.readme!)} path={info.readme!} /></section>}
      {!current && !info.harnesses.length && !readme && (
        <p className="text-sm text-muted-foreground">No ledger, harness or README found. Browse the files in the sidebar.</p>
      )}
    </div>
  )
}
