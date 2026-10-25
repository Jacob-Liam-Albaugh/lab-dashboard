import type { Pin } from './api'

type Join = Pin['join']
type Placed = { pin: Pin; i: number }

// a pin with `join` shares the slide of the pin before it, so slides stay contiguous runs of the pin list
export function slides(pins: Pin[]): Placed[][] {
  const out: Placed[][] = []
  pins.forEach((pin, i) => (pin.join && out.length ? out[out.length - 1].push({ pin, i }) : out.push([{ pin, i }])))
  return out
}

// within a slide, `join: 'below'` stacks a pin under the previous one instead of starting a new column
export function columns(slide: Placed[]): Placed[][] {
  const out: Placed[][] = []
  slide.forEach((x, k) => (k > 0 && x.pin.join === 'below' ? out[out.length - 1].push(x) : out.push([x])))
  return out
}

// swaps pin contents but keeps each position's `join`, so the slide layout stays put while pins move through it
export function swap(pins: Pin[], i: number, j: number): Pin[] {
  const next = [...pins]
  next[i] = { ...pins[j], join: pins[i].join }
  next[j] = { ...pins[i], join: pins[j].join }
  return next.map(clean)
}

const rank = (j: Join) => (j === 'below' ? 2 : j ? 1 : 0)

export function removeAt(pins: Pin[], i: number): Pin[] {
  const next = pins.filter((_, j) => j !== i)
  // the pin after a removed slide or column head takes its place instead of folding into the one before
  if (next[i] && rank(pins[i].join) < rank(next[i].join)) next[i] = { ...next[i], join: pins[i].join }
  return next.map(clean)
}

export const setJoin = (pins: Pin[], i: number, join: Join): Pin[] => pins.map((p, j) => clean(j === i ? { ...p, join } : p))

// moves the pin to a slide of its own right after its current one, leaving the rest of that slide together
export function splitOut(pins: Pin[], i: number): Pin[] {
  let end = i
  while (pins[end + 1]?.join) end++
  const next = removeAt(pins, i)
  next.splice(end, 0, { ...pins[i], join: false })
  return next.map(clean)
}

const clean = ({ join, ...p }: Pin): Pin => (join ? { ...p, join } : p)
