import { expect, test } from 'bun:test'
import { guessScore, ledgerPoints, markdownSection, metricNames, parseDelimited, reduceMetric } from './parse'
import { resolveIn } from '../../server/plugin'

test('parses quoted csv and tsv', () => {
  const csv = parseDelimited('a,b\n1,"x, ""y"""\n2,\n')
  expect(csv).toEqual([{ a: '1', b: 'x, "y"' }, { a: '2', b: '' }])
  expect(parseDelimited('a\tb\n1\t"q" x')).toEqual([{ a: '1', b: '"q" x' }])
})

test('incumbent follows keep decisions, not the running best', () => {
  const rows = parseDelimited('commit\tval_rel_l2\tstatus\na\t0.3\tkeep\nb\t0.1\tdiscard\nc\t0.2\tkeep\nd\t\tcrash')
  const g = guessScore(rows)!
  expect(g).toEqual({ column: 'val_rel_l2', goal: 'min' })
  expect(ledgerPoints(rows, g.column, g.goal).map((p) => [p.status, p.incumbent])).toEqual([
    ['keep', 0.3], ['discard', 0.3], ['keep', 0.2], ['crash', 0.2],
  ])
})

test('without a status column the running best is kept', () => {
  const rows = parseDelimited('tag\tscore\tis_valid\nr0\t1.0\tTrue\nr1\t0.9\tTrue\nr2\t1.2\tTrue\nr3\t5\tFalse')
  expect(ledgerPoints(rows, 'score', 'max').map((p) => p.status)).toEqual(['keep', 'discard', 'keep', 'crash'])
})

test('reduces a nested metric over configs', () => {
  const r = { configs: { a: { metrics: { cov_err: 0.6 } }, b: { metrics: { cov_err: 0.2 } } } }
  expect(reduceMetric(r, 'cov_err', 'min')).toBe(0.2)
  expect(metricNames([{ configs: { a: { hp: { C: 1 }, metrics: { l1: 2 } } } }])).toEqual(['l1', 'C'])
})

test('rejects paths outside the project', () => {
  expect(() => resolveIn('/a/b', '../c')).toThrow()
  expect(() => resolveIn('/a/b', '/a/bc')).toThrow()
  expect(resolveIn('/a/b', 'c/d')).toBe('/a/b/c/d')
})

test('markdown section stops at the next heading of equal or higher level', () => {
  const md = '# A\nintro\n## B\nb text\n```\n# not a heading\n```\n### B1\nnested\n## C\nc text'
  expect(markdownSection(md, '## B')).toBe('b text\n```\n# not a heading\n```\n### B1\nnested')
  expect(markdownSection(md, '## C')).toBe('c text')
  expect(markdownSection(md, '## gone')).toBeNull()
})
