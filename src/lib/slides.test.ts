import { expect, test } from 'bun:test'
import type { Pin } from './api'
import { columns, movePin, moveSlide, removeAt, slides } from './slides'

const pin = (path: string, join?: Pin['join']): Pin => ({ project: 'p', path, title: path, ...(join ? { join } : {}) })
const grid = (pins: Pin[]) => slides(pins).map((s) => columns(s).map((c) => c.map((x) => x.pin.path)))

test('join puts pins on one slide and below stacks them into columns', () => {
  expect(grid([pin('a'), pin('b')])).toEqual([[['a']], [['b']]])
  expect(grid([pin('a', 'below'), pin('b', true), pin('c', 'below'), pin('d')])).toEqual([[['a'], ['b', 'c']], [['d']]])
})

test('removing a slide or column head promotes the pin after it', () => {
  const pins = [pin('a'), pin('b', true), pin('c', 'below'), pin('d', true)]
  expect(grid(removeAt(pins, 0))).toEqual([[['b', 'c'], ['d']]])
  expect(grid(removeAt(pins, 1))).toEqual([[['a'], ['c'], ['d']]])
})

test('moving a pin drops it into a column, a new column or a new slide', () => {
  const pins = [pin('a'), pin('b', true), pin('c', 'below'), pin('d')]
  expect(grid(movePin(pins, 3, { slide: 0, column: 0, row: 1 }))).toEqual([[['a', 'd'], ['b', 'c']]])
  expect(grid(movePin(pins, 2, { slide: 0, column: 1 }))).toEqual([[['a'], ['c'], ['b']], [['d']]])
  expect(grid(movePin(pins, 0, { slide: 2 }))).toEqual([[['b', 'c']], [['d']], [['a']]])
  expect(grid(movePin(pins, 1, { slide: 0, column: 1, row: 2 }))).toEqual([[['a'], ['c', 'b']], [['d']]])
  expect(movePin(pins, 1, { slide: 0, column: 1, row: 0 })).toEqual(pins)
})

test('moving a slide keeps its layout', () => {
  const pins = [pin('a'), pin('b', true), pin('c'), pin('d')]
  expect(grid(moveSlide(pins, 0, 3))).toEqual([[['c']], [['d']], [['a'], ['b']]])
  expect(grid(moveSlide(pins, 1, 0))).toEqual([[['c']], [['a'], ['b']], [['d']]])
})
