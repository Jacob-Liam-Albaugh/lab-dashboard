import { useEffect, useState, useSyncExternalStore } from 'react'

export type ProjectInfo = {
  name: string
  root: string
  readme: string | null
  ledgers: string[]
  harnesses: string[]
  images: string[]
  scripts: string[]
  makeTargets: string[]
  usesUv: boolean
}
export type Entry = { name: string; dir: boolean; size: number; mtime: number }
export type RunMeta = { id: string; project: string; cmd: string; started: string; finished?: string; code?: number | null; figures: string[]; running: boolean }
export type Pin = { project: string; path: string; title: string; run?: string; section?: string }

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()

let version = 0
const listeners = new Set<() => void>()
let source: EventSource | null = null
let watched = ''

/** Bumps a shared version whenever files change in the watched project, so every open view refetches. */
export function useWatch(project: string | undefined) {
  useEffect(() => {
    if (!project || project === watched) return
    source?.close()
    watched = project
    source = new EventSource(`/api/watch?${qs({ p: project })}`)
    source.onmessage = () => { version++; listeners.forEach((l) => l()) }
  }, [project])
}

export const useVersion = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => version)

export const fileUrl = (p: string, path: string, v?: number) => `/api/file?${qs({ p, path, v })}`
export const apiUrl = (route: string, params: Record<string, string | number | undefined>) => `/api/${route}?${qs(params)}`

async function get(url: string, as: 'json' | 'text') {
  const r = await fetch(url)
  if (!r.ok) throw new Error(await r.text())
  return as === 'json' ? r.json() : r.text()
}

export function useFetch<T>(url: string | null, as: 'json' | 'text' = 'json') {
  const v = useVersion()
  const [state, setState] = useState<{ url: string | null; data?: T; error?: string }>({ url: null })
  useEffect(() => {
    if (!url) return
    let live = true
    get(url, as).then((data) => live && setState({ url, data }), (e: Error) => live && setState({ url, error: e.message }))
    return () => { live = false }
  }, [url, as, v])
  const stale = state.url !== url
  return { data: stale ? undefined : state.data, error: stale ? undefined : state.error, loading: !!url && stale }
}

export const useJson = <T,>(url: string | null) => useFetch<T>(url, 'json')
export const useText = (url: string | null) => useFetch<string>(url, 'text')

export async function send(method: 'POST' | 'PUT', url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
