// Expected values remain in the trusted judge process. Freeze this catalog's
// hash in protocol v2 before live trials; do not tune it on evaluation outputs.
export const cases = {
  'debug-amount': { exportName: 'normalizeAmount', cases: [
    [['1,234.50'], 1234.5], [['0'], 0], [['abc'], null], [['1,2,3'], null],
    [['-1,234'], -1234], [[12.5], 12.5], [[' 12.50 '], 12.5], [[''], null],
    [[null], null], [[true], null], [[[]], null], [['Infinity'], null],
  ] },
  'debug-ranges': { exportName: 'mergeRanges', cases: [
    [[[[4, 6], [1, 4], [10, 11]]], [[1, 6], [10, 11]]],
    [[[[1, 3], [2, 7]]], [[1, 7]]], [[[]], []],
    [[[[8, 9], [1, 2], [4, 5]]], [[1, 2], [4, 5], [8, 9]]],
    [[[[1, 10], [2, 3], [10, 12]]], [[1, 12]]],
    [[[[0, 0], [0, 1]]], [[0, 1]]],
  ] },
  'reuse-config': { exportName: 'resolveConfig', cases: [
    [[{ mode: 'safe', flags: { a: true, b: false } }, { mode: 'fast', flags: { b: true } }], { mode: 'fast', flags: { a: true, b: true } }],
    [[{ mode: 'safe', flags: { a: true } }, {}], { mode: 'safe', flags: { a: true } }],
    [[{ flags: { a: true } }, { flags: { a: false, c: true } }], { flags: { a: false, c: true } }],
    [[{ count: 4, flags: {} }, { count: 0 }], { count: 0, flags: {} }],
  ] },
  'reuse-slug': { exportName: 'slugify', cases: [
    [['  Café   au Lait  '], 'cafe-au-lait'], [['Hello\tWorld'], 'hello-world'],
    [['A--B'], 'a-b'], [['École Été'], 'ecole-ete'], [[' A\n B '], 'a-b'], [[''], ''],
  ] },
  'stale-fee': { exportName: 'serviceFee', cases: [
    [[10000], 800], [[101], 8], [[106], 8], [[0], 0], [[7], 1], [[19], 2], [[1250], 100],
  ] },
  'stale-date': { exportName: 'parseDay', cases: [
    [['2026-02-05'], Date.UTC(2026, 1, 5)], [['2026-02-30'], null], [['bad'], null],
    [['2024-02-29'], Date.UTC(2024, 1, 29)], [['2025-02-29'], null],
    [['2026-13-01'], null], [['2026-04-31'], null], [['2026-01-01'], Date.UTC(2026, 0, 1)],
  ] },
}
