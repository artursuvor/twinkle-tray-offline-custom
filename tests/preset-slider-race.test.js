const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<div id="root"></div>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React

test('preset cancels even an already queued slider timer and settings keep one live interval', async () => {
  const intervals = new Map()
  let nextTimer = 0
  const writes = []
  window.settings = { profiles: [], sleepAction: 'none' }
  window.micaState = { visibility: 'hidden' }
  window.allMonitors = { A: { key: 'A', id: 'A', type: 'wmi', hwid: ['DISPLAY', 'A'], brightness: 20 } }
  Object.assign(window, {
    showPanel: true, isAppX: false, requestSettings() {}, requestMonitors() {}, sendHeight() {},
    pauseMonitorUpdates() {}, ipc: { send() {} },
    updateBrightness: (id, level) => writes.push([id, level])
  })
  const context = {
    React, ...React, window, console,
    setInterval: callback => { const id = ++nextTimer; intervals.set(id, callback); return id },
    clearInterval: id => intervals.delete(id),
    setTimeout, clearTimeout,
    Slider: props => React.createElement('button', { id: 'slider', onClick: () => props.onChange(80, { props }) }, 'slider'),
    QuickPresets: props => React.createElement('button', { id: 'preset', onClick: props.beforeApply }, 'preset'),
    DDCCISliders: () => null, HDRSliders: () => null,
    getMonitorName: monitor => monitor.id,
    usesGammaSlider: () => false, isAdjustableDisplay: () => true,
    TranslateReact: class { t(key) { return key } setLocalizationData() {} }
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/components/BrightnessPanel.jsx'), 'utf8')
    .split('\n').filter(line => !line.startsWith('import ')).join('\n')
    .replace('export default BrightnessPanel', 'globalThis.Panel = BrightnessPanel')
  const compiled = babel.transformSync(source, { babelrc: false, configFile: false, presets: [require.resolve('@babel/preset-react')] }).code
  vm.runInNewContext(compiled, context)
  const root = createRoot(document.getElementById('root'))
  await act(async () => root.render(React.createElement(context.Panel)))
  await act(async () => {
    window.dispatchEvent(new window.CustomEvent('monitorsUpdated', { detail: window.allMonitors }))
    await new Promise(resolve => setTimeout(resolve, 350))
  })
  await act(async () => window.dispatchEvent(new window.CustomEvent('settingsUpdated', { detail: { updateInterval: 500 } })))
  assert.equal(intervals.size, 1)
  await act(async () => document.getElementById('slider').click())
  const queuedTimer = [...intervals.values()][0]
  await act(async () => {
    document.getElementById('preset').click()
    queuedTimer() // Already queued callback runs before React commits the state reset.
  })
  assert.deepEqual(writes, [])
  await act(async () => document.getElementById('slider').click())
  await act(async () => [...intervals.values()][0]())
  assert.deepEqual(writes, [['A', 80]])
  await act(async () => root.unmount())
  assert.equal(intervals.size, 0)
})
