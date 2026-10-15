// Personal offline build: only local files and Windows named-pipe IPC are allowed.
const error = () => Object.assign(new Error('Network access is disabled in this offline build.'), { code: 'ERR_OFFLINE' })
const deny = () => { throw error() }
const reject = async () => { throw error() }

function isLocalPipe(args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const address = typeof first === 'string' ? first : first?.path
  return typeof address === 'string' && address.startsWith('\\\\.\\pipe\\')
}

function installNodePolicy() {
  const net = require('node:net')
  for (const [prototype, method] of [[net.Socket.prototype, 'connect'], [net.Server.prototype, 'listen']]) {
    const original = prototype[method]
    prototype[method] = function (...args) {
      if (!isLocalPipe(args)) return deny()
      return original.apply(this, args)
    }
  }
  for (const name of ['node:http', 'node:https']) {
    const transport = require(name)
    transport.request = deny
    transport.get = deny
  }
  require('node:http2').connect = deny
  require('node:tls').connect = deny
  require('node:dgram').createSocket = deny
  const dns = require('node:dns')
  for (const key of Object.keys(dns)) {
    if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function') dns[key] = deny
  }
  for (const key of Object.keys(dns.promises)) {
    if (/^(lookup|resolve|reverse)/.test(key) && typeof dns.promises[key] === 'function') dns.promises[key] = reject
  }
  for (const Resolver of [dns.Resolver, dns.promises.Resolver]) {
    for (const key of Object.getOwnPropertyNames(Resolver.prototype)) {
      if (/^(resolve|reverse)/.test(key)) Resolver.prototype[key] = deny
    }
  }
  global.fetch = reject
  if (typeof global.WebSocket === 'function') global.WebSocket = class { constructor() { deny() } }
  if (typeof window !== 'undefined') {
    window.fetch = reject
    window.WebSocket = class { constructor() { deny() } }
  }
}

function installElectronPolicy(electron) {
  for (const flag of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability', 'no-pings'])
    electron.app.commandLine.appendSwitch(flag)
  electron.app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND')
  electron.shell.openExternal = async () => false
  const guard = session => session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(file|data|blob|devtools):/i.test(details.url) })
  })
  electron.app.on('session-created', guard)
  electron.app.whenReady().then(() => guard(electron.session.defaultSession))
  electron.net.request = deny
  electron.net.fetch = reject
}

function enforceOfflineSettings(settings) {
  settings.analytics = false
  settings.checkForUpdates = false
  settings.udpEnabled = false
  settings.udpRemote = false
  if (settings.lightSensor?.active === 'yocto') settings.lightSensor = { ...settings.lightSensor, active: 'windows', enabled: false }
  settings.offline = true
  return settings
}

module.exports = { installNodePolicy, installElectronPolicy, enforceOfflineSettings, isLocalPipe }
