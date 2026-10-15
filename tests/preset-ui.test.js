const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const babel = require('@babel/core')
const { JSDOM } = require('jsdom')

// Compile only the JSX components used in this isolated DOM test.
require.extensions['.jsx'] = (module, filename) => {
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }], require.resolve('@babel/preset-react')]
  })
  module._compile(result.code, filename)
}
require.extensions['.css'] = () => {}
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')
const QuickPresets = require('../src/components/QuickPresets.jsx').default
const PresetSettings = require('../src/components/PresetSettings.jsx').default

test('panel is only preset buttons; creation and value editing live in settings', async () => {
  const calls = []
  const profile = { uuid: 'night', name: 'Ночь', quickPreset: true, setBrightness: true, showInMenu: true, monitors: { A: 15 } }
  window.settings = { profiles: [profile] }
  window.ipc = { invoke: async (channel, request) => { calls.push(request); return { ok: true } } }
  const monitors = { first: { id: 'A', name: 'Основной', brightness: 15 } }
  const host = document.getElementById('root')
  const root = createRoot(host)
  let beforeApply = 0
  await act(async () => root.render(React.createElement(QuickPresets, { monitors, beforeApply: () => beforeApply++ })))
  assert.equal(host.querySelectorAll('input, form').length, 0)
  assert.equal(host.querySelectorAll('button').length, 1)
  assert.equal(host.querySelector('button').getAttribute('aria-pressed'), 'true')
  await act(async () => host.querySelector('button').click())
  assert.deepEqual(calls.pop(), { action: 'apply', id: 'night' })
  assert.equal(beforeApply, 1)
  assert.equal(host.querySelector('[role="status"]'), null)

  await act(async () => root.render(React.createElement(PresetSettings, { monitors })))
  assert.ok(host.querySelector('[aria-label="Название нового пресета"]'))
  assert.ok(host.querySelector('.preset-settings-card'))
  assert.ok(host.querySelector('input[type="range"]'))
  assert.equal(host.querySelector('input[type="number"]').value, '15')
  const nameInput = host.querySelector('[aria-label="Название нового пресета"]')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nameInput, 'Работа')
    nameInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await act(async () => host.querySelector('.preset-settings-create').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
  assert.deepEqual(calls.pop(), { action: 'save', name: 'Работа' })
  await act(async () => root.unmount())
})
