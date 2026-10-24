import { useSyncExternalStore } from 'react'

export type Route =
  | { view: 'home' }
  | { view: 'present' }
  | { view: 'project'; project: string }
  | { view: 'runs'; project: string }
  | { view: 'file' | 'dir'; project: string; path: string }

export function parseHash(hash: string): Route {
  const [, kind, project, sub, ...rest] = hash.replace(/^#/, '').split('/').map(decodeURIComponent)
  if (kind === 'present') return { view: 'present' }
  if (kind !== 'p' || !project) return { view: 'home' }
  if (sub === 'run') return { view: 'runs', project }
  if (sub === 'f' || sub === 'd') return { view: sub === 'f' ? 'file' : 'dir', project, path: rest.join('/') }
  return { view: 'project', project }
}

export function href(r: Route): string {
  const e = encodeURIComponent
  switch (r.view) {
    case 'home': return '#/'
    case 'present': return '#/present'
    case 'project': return `#/p/${e(r.project)}`
    case 'runs': return `#/p/${e(r.project)}/run`
    default: return `#/p/${e(r.project)}/${r.view === 'file' ? 'f' : 'd'}/${r.path.split('/').map(e).join('/')}`
  }
}

const subscribe = (l: () => void) => (addEventListener('hashchange', l), () => removeEventListener('hashchange', l))
export const useRoute = () => parseHash(useSyncExternalStore(subscribe, () => location.hash))
