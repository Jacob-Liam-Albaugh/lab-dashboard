import { useSyncExternalStore } from 'react'

export type Route =
  | { view: 'home' }
  | { view: 'present' }
  | { view: 'project'; project: string }
  | { view: 'runs'; project: string }
  | { view: 'file' | 'dir'; project: string; path: string }

export function parsePath(pathname: string): Route {
  const [, project, sub, ...rest] = pathname.split('/').map(decodeURIComponent)
  if (!project) return { view: 'home' }
  if (project === 'present') return { view: 'present' }
  if (sub === 'run') return { view: 'runs', project }
  if (sub === 'f' || sub === 'd') return { view: sub === 'f' ? 'file' : 'dir', project, path: rest.join('/') }
  return { view: 'project', project }
}

export function href(r: Route): string {
  const e = encodeURIComponent
  switch (r.view) {
    case 'home': return '/'
    case 'present': return '/present'
    case 'project': return `/${e(r.project)}`
    case 'runs': return `/${e(r.project)}/run`
    default: return `/${e(r.project)}/${r.view === 'file' ? 'f' : 'd'}/${r.path.split('/').map(e).join('/')}`
  }
}

// marks entries pushed in-app, so leaving Present knows whether history.back() stays in the dashboard
export function navigate(to: string) {
  history.pushState({ inApp: true }, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
}

// keeps old #/p/... bookmarks working
if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1).replace(/^\/p\//, '/'))

addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a') : null
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  if (a.target || a.hasAttribute('download') || a.origin !== location.origin || a.pathname.startsWith('/api/')) return
  if (a.pathname === location.pathname && a.hash) return
  e.preventDefault()
  navigate(a.pathname + a.search + a.hash)
})

const subscribe = (l: () => void) => (addEventListener('popstate', l), () => removeEventListener('popstate', l))
export const useRoute = () => parsePath(useSyncExternalStore(subscribe, () => location.pathname))
