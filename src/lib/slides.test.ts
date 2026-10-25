import { expect, test } from 'bun:test'
import type { Pin } from './api'
import { removeAt, setJoin, slides, splitOut, swap } from './slides'

const pin = (path: string, join?: boolean): Pin => ({ project: 'p', path, title: path, ...(join ? { join } : {}) })
const layout = (pins: Pin[]) => slides(pins).map((s) => s.map((x) => x.pin.path))

test('pins without join each get a slide, joined pins share one', () => {
  expect(layout([pin('a'), pin('b')])).toEqual([['a'], ['b']])
  expect(layout([pin('a', true), pin('b', true), pin('c')])).toEqual([['a', 'b'], ['c']])
})

test('moving keeps the slide layout and removing a head promotes the next pin', () => {
  const pins = [pin('a'), pin('b', true), pin('c')]
  expect(layout(swap(pins, 1, 2))).toEqual([['a', 'c'], ['b']])
  expect(layout(removeAt(pins, 0))).toEqual([['b'], ['c']])
  expect(layout(removeAt(pins, 1))).toEqual([['a'], ['c']])
  expect(setJoin(setJoin(pins, 2, true), 1, false)).toEqual([pin('a'), pin('b'), pin('c', true)])
})

test('splitting a pin out leaves the rest of its slide together', () => {
  const pins = [pin('a'), pin('b', true), pin('c', true), pin('d')]
  expect(layout(splitOut(pins, 1))).toEqual([['a', 'c'], ['b'], ['d']])
  expect(layout(splitOut(pins, 2))).toEqual([['a', 'b'], ['c'], ['d']])
})
