import { useState } from 'react'
import { ChevronRightIcon, FileIcon, FlaskConicalIcon, FolderIcon, MonitorPlayIcon, MoonIcon, PlayIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { apiUrl, useJson, type Entry } from '@/lib/api'
import { href, type Route } from '@/lib/route'

type ProjectRow = { name: string; path: string; exists: boolean }

function Tree({ project, dir, current }: { project: string; dir: string; current?: string }) {
  const { data } = useJson<Entry[]>(apiUrl('tree', { p: project, dir }))
  return (
    <SidebarMenuSub className="mr-0 pr-0">
      {data?.map((e) => <Node key={e.name} project={project} path={dir ? `${dir}/${e.name}` : e.name} entry={e} current={current} />)}
    </SidebarMenuSub>
  )
}

function Node({ project, path, entry, current }: { project: string; path: string; entry: Entry; current?: string }) {
  const [open, setOpen] = useState(() => !!current?.startsWith(`${path}/`))
  if (!entry.dir) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton size="sm" isActive={current === path} render={<a href={href({ view: 'file', project, path })} />}>
          <FileIcon /><span>{entry.name}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    )
  }
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton size="sm" isActive={current === path} render={<a href={href({ view: 'dir', project, path })} />} onClick={() => setOpen(true)}>
        <ChevronRightIcon className={`transition-transform ${open ? 'rotate-90' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }} />
        <FolderIcon /><span>{entry.name}</span>
      </SidebarMenuSubButton>
      {open && <Tree project={project} dir={path} current={current} />}
    </SidebarMenuSubItem>
  )
}

export function AppSidebar({ route }: { route: Route }) {
  const { data: projects } = useJson<ProjectRow[]>('/api/projects')
  const { resolvedTheme, setTheme } = useTheme()
  const active = 'project' in route ? route.project : undefined
  const current = 'path' in route ? route.path : undefined
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <a href="#/" className="flex items-center gap-2 px-2 py-1 font-semibold"><FlaskConicalIcon className="size-4" />Lab dashboard</a>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects?.map((p) => (
                <SidebarMenuItem key={p.name}>
                  <SidebarMenuButton isActive={active === p.name && route.view === 'project'} disabled={!p.exists} title={p.path}
                    render={<a href={href({ view: 'project', project: p.name })} />}>
                    <FolderIcon /><span>{p.name}</span>{!p.exists && <span className="ml-auto text-xs text-critical">missing</span>}
                  </SidebarMenuButton>
                  {active === p.name && p.exists && (
                    <>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton size="sm" isActive={route.view === 'runs'} render={<a href={href({ view: 'runs', project: p.name })} />}>
                            <PlayIcon /><span>Runs</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                      <Tree project={p.name} dir="" current={current} />
                    </>
                  )}
                </SidebarMenuItem>
              ))}
              {projects?.length === 0 && <p className="px-2 text-xs text-muted-foreground">Add folders to projects.json.</p>}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<a href="#/present" />}><MonitorPlayIcon /><span>Present</span></SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
              {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}<span>{resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
