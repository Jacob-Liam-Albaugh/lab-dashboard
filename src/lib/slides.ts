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

const rank = (j: Join) => (j === 'below' ? 2 : j ? 1 : 0)

export function removeAt(pins: Pin[], i: number): Pin[] {
  const next = pins.filter((_, j) => j !== i)
  // the pin after a removed slide or column head takes its place instead of folding into the one before
  if (next[i] && rank(pins[i].join) < rank(next[i].join)) next[i] = { ...next[i], join: pins[i].join }
  return next.map(clean)
}

export type Drop = { slide: number; column?: number; row?: number }

// drops into an existing column when `row` is set, a new column when only `column` is, else a new slide
export function movePin(pins: Pin[], i: number, to: Drop): Pin[] {
  // the moved pin leaves a hole first so drop indices still refer to the layout that was on screen
  const deck: (Pin | null)[][][] = slides(pins).map((s) => columns(s).map((c) => c.map((x) => (x.i === i ? null : x.pin))))
  if (to.row !== undefined) deck[to.slide][to.column!].splice(to.row, 0, pins[i])
  else if (to.column !== undefined) deck[to.slide].splice(to.column, 0, [pins[i]])
  else deck.splice(to.slide, 0, [[pins[i]]])
  return flatten(deck)
}

export function moveSlide(pins: Pin[], from: number, to: number): Pin[] {
  const deck: (Pin | null)[][][] = slides(pins).map((s) => columns(s).map((c) => c.map((x) => x.pin)))
  const [moved] = deck.splice(from, 1)
  deck.splice(to > from ? to - 1 : to, 0, moved)
  return flatten(deck)
}

const flatten = (deck: (Pin | null)[][][]): Pin[] =>
  deck.map((s) => s.map((c) => c.filter((p) => p !== null)).filter((c) => c.length)).filter((s) => s.length)
    .flatMap((s) => s.flatMap((col, c) => col.map((p, r) => clean({ ...p, join: r ? 'below' : c > 0 }))))

export const pinKey = (p: Pin) => `${p.project}:${p.run}:${p.path}:${p.section}:${p.part}`

const clean = ({ join, ...p }: Pin): Pin => (join ? { ...p, join } : p)
