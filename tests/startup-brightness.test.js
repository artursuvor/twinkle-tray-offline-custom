const test = require('node:test')
const assert = require('node:assert/strict')
const { StartupBrightness } = require('../src/startup-brightness')

test('local time cutoff includes midnight and 06:59, excludes 07:00 and evening', () => {
  for (const [hour, minute, expected] of [[0, 0, true], [6, 59, true], [7, 0, false], [23, 0, false]]) {
    const start = new Date(2026, 9, 24, hour, minute)
    const policy = new StartupBrightness(start)
    const writes = []
    policy.apply({ a: { id: 'A' } }, (monitor, level) => { writes.push(level); return true }, start.getTime())
    assert.deepEqual(writes, expected ? [0] : [])
  }
})

test('late monitors get one minimum write; unready monitors retry; manual input cancels', () => {
  const start = new Date(2026, 9, 24, 6, 59, 50).getTime()
  const policy = new StartupBrightness(new Date(start))
  const writes = []
  const apply = (monitor, level) => { writes.push([monitor.id, level]); return true }
  policy.apply({ a: { id: 'A' } }, apply, start)
  policy.apply({ a: { id: 'A' }, b: { id: 'B' } }, () => false, start + 1000)
  policy.apply({ a: { id: 'A' }, b: { id: 'B' } }, apply, start + 20000)
  assert.deepEqual(writes, [['A', 0], ['B', 0]])
  policy.cancel()
  policy.apply({ c: { id: 'C' } }, apply, start + 30000)
  assert.equal(writes.length, 2)
  const expired = new StartupBrightness(new Date(start))
  expired.apply({ a: { id: 'A' } }, apply, start + 120000)
  assert.equal(writes.length, 2)
})
