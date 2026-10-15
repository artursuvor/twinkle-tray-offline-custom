const test = require('node:test')
const assert = require('node:assert/strict')
const { captureBrightness, makeQuickPreset } = require('../src/quick-presets')

const monitors = {
  primary: { key: 'primary', id: 'DISPLAY-1', type: 'ddcci', brightnessType: 0x10, brightness: 64.5 },
  laptop: { key: 'laptop', id: 'DISPLAY-2', type: 'wmi', brightness: 0 },
  unsupported: { key: 'unsupported', id: 'DISPLAY-3', type: 'none', brightness: 50 }
}

test('captures displayed slider values including zero, without retaining mutable references', () => {
  const levels = { 'DISPLAY-1': 23.25, 'DISPLAY-2': 0, 'DISPLAY-3': 80, FAKE: 90 }
  const snapshot = captureBrightness(monitors, levels)
  levels['DISPLAY-1'] = 99
  assert.deepEqual(snapshot, { 'DISPLAY-1': 23.25, 'DISPLAY-2': 0 })
})

test('rejects malformed/out-of-range values rather than changing brightness unexpectedly', () => {
  for (const invalid of [NaN, Infinity, -1, 101, '80', null]) {
    assert.equal(captureBrightness(monitors, { 'DISPLAY-1': invalid })['DISPLAY-1'], undefined)
  }
})

test('captures opt-in gamma monitors but excludes HDR-only displays', () => {
  const displays = { screen: { key: 'screen', id: 'GAMMA', type: 'none', brightness: 15, gammaBrightness: 15 } }
  const options = { gammaAsMainSliderDisplays: { screen: true } }
  assert.deepEqual(captureBrightness(displays, {}, options), { GAMMA: 15 })
  displays.screen.hdr = 'active'
  assert.deepEqual(captureBrightness(displays, {}, options), {})
})

test('named snapshot survives JSON persistence with stable monitor identities', () => {
  const preset = makeQuickPreset('  Вечер  ', monitors, {}, {}, 'preset-id')
  const restored = JSON.parse(JSON.stringify(preset))
  assert.equal(restored.name, 'Вечер')
  assert.equal(restored.uuid, 'preset-id')
  assert.equal(restored.quickPreset, true)
  assert.equal(restored.showInMenu, true)
  assert.deepEqual(restored.monitors, { 'DISPLAY-1': 64.5, 'DISPLAY-2': 0 })
})

test('validates names and refuses empty snapshots', () => {
  for (const name of ['', '   ', 'x'.repeat(81), null])
    assert.throws(() => makeQuickPreset(name, monitors, {}, {}, 'id'), /invalid-name/)
  assert.throws(() => makeQuickPreset('Night', {}, {}, {}, 'id'), /no-monitors/)
})
