import { useSyncExternalStore } from 'react'

export const PALETTES = [
  { id: 'light', name: 'Light', dark: false, colors: ['#f5f4f2', '#ffffff', '#4263eb', '#2a2724'] },
  { id: 'sand', name: 'Sand', dark: false, colors: ['#ebe2cc', '#ded6c1', '#cfc6b1', '#b7b09e'] },
  { id: 'stone', name: 'Stone', dark: false, colors: ['#b6ae9f', '#c5c7bc', '#deded1', '#fbf3d1'] },
  { id: 'pastel', name: 'Pastel', dark: false, colors: ['#fdf4d2', '#b0cde6', '#a290b7', '#946d6d'] },
  { id: 'rosewood', name: 'Rosewood', dark: false, colors: ['#452829', '#57595b', '#e8d1c5', '#f3e8df'] },
  { id: 'wine', name: 'Wine', dark: true, colors: ['#2c2c2c', '#853953', '#612d53', '#f3f4f4'] },
  { id: 'crimson', name: 'Crimson', dark: true, colors: ['#f7374f', '#88304e', '#522546', '#2c2c2c'] },
  { id: 'oxblood', name: 'Oxblood', dark: true, colors: ['#6d0808', '#2d0000', '#757d6f', '#eeead7'] },
  { id: 'leather', name: 'Leather', dark: true, colors: ['#622b14', '#995f2f', '#978f66', '#e4d6a9'] },
  { id: 'espresso', name: 'Espresso', dark: true, colors: ['#000000', '#1f150c', '#412d15', '#e1dcc9'] },
  { id: 'olive', name: 'Olive', dark: true, colors: ['#181c14', '#3c3d37', '#697565', '#ecdfcc'] },
  { id: 'dusk', name: 'Dusk', dark: true, colors: ['#37353e', '#44444e', '#715a5a', '#d3dad9'] },
  { id: 'navy', name: 'Navy sand', dark: true, colors: ['#202940', '#4b4038', '#9a8678', '#caaa98'] },
]

const watch = (on: () => void) => {
  const o = new MutationObserver(on)
  o.observe(document.documentElement, { attributeFilter: ['class'] })
  return () => o.disconnect()
}
export const useDark = () => useSyncExternalStore(watch, () => document.documentElement.classList.contains('dark'))

export function applyPalette(id: string | null) {
  const palette = PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === 'wine')!
  document.documentElement.dataset.palette = palette.id
  document.documentElement.classList.toggle('dark', palette.dark)
  return palette.id
}
