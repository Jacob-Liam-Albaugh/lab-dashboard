import type { Pin } from './api'

// a pin with `join` shares the slide of the pin before it, so slides stay contiguous runs of the pin list
export function slides(pins: Pin[]): { pin: Pin; i: number }[][] {
  const out: { pin: Pin; i: number }[][] = []
  pins.forEach((pin, i) => (pin.join && out.length ? out[out.length - 1].push({ pin, i }) : out.push([{ pin, i }])))
  return out
}

// swaps pin contents but keeps each position's `join`, so the slide layout stays put while pins move through it
export function swap(pins: Pin[], i: number, j: number): Pin[] {
  const next = [...pins]
  next[i] = { ...pins[j], join: pins[i].join }
  next[j] = { ...pins[i], join: pins[j].join }
  return next.map(clean)
}

export function removeAt(pins: Pin[], i: number): Pin[] {
  const next = pins.filter((_, j) => j !== i)
  // the pin after a removed slide head becomes the head instead of folding into the previous slide
  if (next[i]?.join && !pins[i].join) next[i] = { ...next[i], join: false }
  return next.map(clean)
}

export const setJoin = (pins: Pin[], i: number, join: boolean): Pin[] => pins.map((p, j) => clean(j === i ? { ...p, join } : p))

const clean = ({ join, ...p }: Pin): Pin => (join ? { ...p, join } : p)
