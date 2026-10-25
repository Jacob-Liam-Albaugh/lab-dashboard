import type { Pin } from './api'

/** Groups pins into slides: a pin with join shares the slide of the pin before it. */
export function slidesOf(pins: Pin[]) {
  const slides: Pin[][] = []
  const slideOf = pins.map((p) => {
    if (!p.join || !slides.length) slides.push([])
    slides.at(-1)!.push(p)
    return slides.length - 1
  })
  return { slides, slideOf }
}

// hands a removed slide-leader's place to the next pin, so its slide-mates don't merge into the previous slide
export const dropPin = (pins: Pin[], i: number) =>
  pins.flatMap((p, j) => (j === i ? [] : j === i + 1 && p.join ? [{ ...p, join: pins[i].join || undefined }] : [p]))
