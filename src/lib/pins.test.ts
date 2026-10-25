import { expect, test } from 'bun:test'
import type { Pin } from './api'
import { dropPin, slidesOf } from './pins'

const pin = (path: string, join?: boolean): Pin => ({ project: 'p', path, title: path, join })
const titles = (pins: Pin[]) => slidesOf(pins).slides.map((s) => s.map((p) => p.path).join('+'))

test('joined pins share the previous slide', () => {
  const pins = [pin('a', true), pin('b', true), pin('c'), pin('d', true)]
  expect(titles(pins)).toEqual(['a+b', 'c+d'])
  expect(slidesOf(pins).slideOf).toEqual([0, 0, 1, 1])
})

test('removing a slide leader keeps its slide-mates together and apart from the previous slide', () => {
  const pins = [pin('a'), pin('b'), pin('c', true), pin('d')]
  expect(titles(dropPin(pins, 1))).toEqual(['a', 'c', 'd'])
  expect(titles(dropPin(pins, 2))).toEqual(['a', 'b', 'd'])
  expect(titles(dropPin([pin('a'), pin('b', true), pin('c')], 1))).toEqual(['a', 'c'])
})
