const test = require('node:test')
const assert = require('node:assert/strict')
const { installNodePolicy, installElectronPolicy, enforceOfflineSettings, isLocalPipe } = require('../src/offline')

test('settings cannot enable telemetry, updates or UDP, even from an imported config', () => {
  const settings = enforceOfflineSettings({ analytics: true, checkForUpdates: true, udpEnabled: true, udpRemote: true,
    lightSensor: { enabled: true, active: 'yocto' }, profiles: [{ name: 'Night' }] })
  for (const field of ['analytics', 'checkForUpdates', 'udpEnabled', 'udpRemote']) assert.equal(settings[field], false)
  assert.equal(settings.lightSensor.enabled, false)
  assert.equal(settings.profiles[0].name, 'Night')
})

test('Electron cancels remote requests while keeping local UI files available', async () => {
  const callbacks = {}, flags = []
  let requestGuard
  const session = { webRequest: { onBeforeRequest: callback => { requestGuard = callback } } }
  const electron = {
    app: { commandLine: { appendSwitch: (...args) => flags.push(args) }, on: (event, callback) => { callbacks[event] = callback }, whenReady: async () => {} },
    shell: { openExternal: () => { throw Error('Unexpected browser launch') } },
    net: {}, session: { defaultSession: session }
  }
  installElectronPolicy(electron)
  await Promise.resolve()
  for (const url of ['https://api.github.com', 'http://127.0.0.1:3000', 'ws://localhost', 'ftp://example.invalid']) {
    requestGuard({ url }, result => assert.equal(result.cancel, true))
  }
  requestGuard({ url: 'file:///C:/app/build/index.html' }, result => assert.equal(result.cancel, false))
  assert.equal(await electron.shell.openExternal('https://example.invalid'), false)
  assert.throws(() => electron.net.request('https://example.invalid'), { code: 'ERR_OFFLINE' })
  assert.ok(flags.some(([name]) => name === 'disable-background-networking'))
})

test('Node networking fails before DNS or sockets; local named-pipe IPC still works', async () => {
  const net = require('node:net')
  installNodePolicy()
  await assert.rejects(fetch('https://example.invalid'), { code: 'ERR_OFFLINE' })
  assert.throws(() => require('node:https').get('https://example.invalid'), { code: 'ERR_OFFLINE' })
  assert.throws(() => net.connect(80, '127.0.0.1'), { code: 'ERR_OFFLINE' })
  assert.throws(() => require('node:dgram').createSocket('udp4'), { code: 'ERR_OFFLINE' })
  assert.throws(() => require('node:dns').lookup('example.invalid', () => {}), { code: 'ERR_OFFLINE' })
  assert.throws(() => new (require('node:dns').Resolver)().resolve('example.invalid', () => {}), { code: 'ERR_OFFLINE' })
  assert.equal(isLocalPipe([{ path: '\\\\.\\pipe\\offline-test' }]), true)
  const pipe = `\\\\.\\pipe\\twinkle-offline-test-${process.pid}`
  const server = net.createServer(socket => socket.end('local IPC works'))
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve) })
  try {
    const reply = await new Promise((resolve, reject) => {
      let data = ''
      const socket = net.connect(pipe)
      socket.on('error', reject).on('data', chunk => { data += chunk }).on('end', () => resolve(data))
    })
    assert.equal(reply, 'local IPC works')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
