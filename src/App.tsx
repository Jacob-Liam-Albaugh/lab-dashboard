import { useEffect } from 'react'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useJson, useWatch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { href, navigate, useRoute } from '@/lib/route'
import { AppSidebar } from './components/AppSidebar'
import { FileView } from './components/FileView'
import { FolderView } from './components/FolderView'
import { PresentView } from './components/Present'
import { ProjectView } from './components/ProjectView'
import { RunPanel } from './components/RunPanel'

function Home() {
  const { data } = useJson<{ name: string; exists: boolean }[]>('/api/projects')
  return (
    <div className="space-y-4">
      <h1 className="text-[2rem] leading-tight">Projects</h1>
      {data?.length === 0 && <p className="text-sm text-muted-foreground">Copy projects.example.json to projects.json and list the lab folders to watch.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data?.filter((p) => p.exists).map((p) => (
          <li key={p.name}><a className="block rounded-md border p-4 hover:bg-muted/50" href={href({ view: 'project', project: p.name })}>{p.name}</a></li>
        ))}
      </ul>
    </div>
  )
}

function usePresentKey() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== 'p' || e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || t.closest('input, textarea, select')) return
      navigate('/present')
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])
}

export default function App() {
  const route = useRoute()
  usePresentKey()
  useWatch('project' in route ? route.project : undefined)
  if (route.view === 'present') return <PresentView />
  return (
    <SidebarProvider>
      <AppSidebar route={route} />
      <SidebarInset className="min-w-0">
        <header className="flex h-10 items-center border-b px-2"><SidebarTrigger /></header>
        <main className={cn('mx-auto w-full p-4 md:p-6', !(route.view === 'file' && route.path.endsWith('.html')) && 'max-w-7xl')}>
          {route.view === 'home' && <Home />}
          {route.view === 'project' && <ProjectView key={route.project} project={route.project} />}
          {route.view === 'runs' && <RunPanel key={route.project} project={route.project} />}
          {route.view === 'file' && <FileView key={route.path} project={route.project} path={route.path} />}
          {route.view === 'dir' && <FolderView key={route.path} project={route.project} dir={route.path} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
