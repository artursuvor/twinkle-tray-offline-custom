const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { makeQuickPreset, updateQuickPreset, isPresetActive } = require('../src/quick-presets')

function setup() {
  const source = fs.readFileSync(path.join(__dirname, '../src/electron.js'), 'utf8')
  const start = source.indexOf("ipcMain.handle('quick-preset'")
  const end = source.indexOf("ipcMain.on('retry-ddc-validation'", start)
  let handler
  const panel = {}, settingsPage = {}
  const state = { profiles: [] }
  const applied = []
  const context = {
    ipcMain: { handle: (channel, callback) => { handler = callback } },
    mainWindow: { webContents: panel }, settingsWindow: { webContents: settingsPage },
    settings: state,
    monitors: { monitor: { key: 'monitor', id: 'DISPLAY-1', type: 'wmi', brightness: 37 } },
    uuid: () => 'test-preset', makeQuickPreset, updateQuickPreset,
    writeSettings: next => Object.assign(state, next),
    applyProfileBrightness: profile => applied.push(profile)
  }
  vm.runInNewContext(source.slice(start, end), context)
  return { state, applied, context, request: (sender, request) => handler({ sender }, request), panel, settingsPage }
}

test('creation and editing belong to settings; panel can only apply', () => {
  const fixture = setup()
  assert.equal(fixture.request(fixture.panel, { action: 'save', name: 'Evening' }).error, 'invalid-sender')
  assert.equal(fixture.request({}, { action: 'save', name: 'Evening' }).error, 'invalid-sender')
  assert.equal(fixture.request(fixture.settingsPage, { action: 'save', name: 'Evening' }).ok, true)
  assert.equal(fixture.state.profiles[0].monitors['DISPLAY-1'], 37)
  assert.equal(fixture.request(fixture.settingsPage, { action: 'apply', id: 'test-preset' }).error, 'invalid-sender')
  assert.equal(fixture.request(fixture.panel, { action: 'apply', id: 'test-preset' }).ok, true)
  assert.equal(fixture.applied.length, 1)
})

test('settings changes survive serialization and preserve disconnected displays', () => {
  const fixture = setup()
  fixture.request(fixture.settingsPage, { action: 'save', name: 'Evening' })
  fixture.state.profiles[0].monitors.DISCONNECTED = 22
  const result = fixture.request(fixture.settingsPage, {
    action: 'update', id: 'test-preset', name: '  Night  ', levels: { 'DISPLAY-1': 0, INJECTED: 99 }
  })
  assert.equal(result.ok, true)
  const stored = JSON.parse(JSON.stringify(fixture.state.profiles[0]))
  assert.equal(stored.name, 'Night')
  assert.deepEqual(stored.monitors, { 'DISPLAY-1': 0, DISCONNECTED: 22 })
  assert.equal(stored.uuid, 'test-preset')
})

test('invalid edits and duplicate names do not alter saved profiles', () => {
  const fixture = setup()
  fixture.request(fixture.settingsPage, { action: 'save', name: 'Evening' })
  fixture.state.profiles.push({ uuid: 'other', name: 'Work', quickPreset: true, monitors: { 'DISPLAY-1': 80 } })
  for (const levels of [{ 'DISPLAY-1': -1 }, { 'DISPLAY-1': 101 }, { 'DISPLAY-1': '' }, null]) {
    assert.equal(fixture.request(fixture.settingsPage, { action: 'update', id: 'test-preset', name: 'Evening', levels }).error, 'invalid-levels')
  }
  assert.equal(fixture.request(fixture.settingsPage, { action: 'update', id: 'test-preset', name: ' work ', levels: {} }).error, 'duplicate-name')
  assert.equal(fixture.state.profiles[0].name, 'Evening')
  assert.equal(fixture.state.profiles[0].monitors['DISPLAY-1'], 37)
})

test('preset highlight follows brightness and has no active state with no matching displays', () => {
  const profile = { monitors: { A: 0, B: 70 } }
  assert.equal(isPresetActive(profile, { first: { id: 'A', brightness: 0 } }), true)
  assert.equal(isPresetActive(profile, { first: { id: 'A', brightness: 1 } }), false)
  assert.equal(isPresetActive(profile, { first: { id: 'A', brightness: 0 }, second: { id: 'B', brightness: 10 } }), false)
  assert.equal(isPresetActive(profile, {}), false)
})
