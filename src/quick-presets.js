// Shared validation for brightness snapshots and their settings editor.
function captureBrightness(monitors, levels = {}, options = {}) {
  const result = {}
  for (const monitor of Object.values(monitors || {})) {
    const gamma = options.gammaAsMainSliderDisplays?.[monitor.key] &&
      monitor.hdr !== 'active' && monitor.gammaBrightness >= 0
    const hardware = ['wmi', 'studio-display', 'software'].includes(monitor.type) ||
      (monitor.type === 'ddcci' && !!monitor.brightnessType)
    if ((!hardware && !gamma) || !monitor.id) continue
    const level = Object.prototype.hasOwnProperty.call(levels, monitor.id) ? levels[monitor.id] : monitor.brightness
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 100) continue
    result[monitor.id] = level
  }
  return result
}

function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
    throw new Error('invalid-name')
  return name.trim()
}

function makeQuickPreset(name, monitors, levels, options, id) {
  name = validateName(name)
  const snapshot = captureBrightness(monitors, levels, options)
  if (!Object.keys(snapshot).length) throw new Error('no-monitors')
  return {
    id, uuid: id, name: name.trim(), path: '', overlayType: 'normal',
    setBrightness: true, showInMenu: true, quickPreset: true, monitors: snapshot
  }
}

function updateQuickPreset(profile, name, levels) {
  name = validateName(name)
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) throw new Error('invalid-levels')
  // Preserve disconnected monitors. Editing cannot add arbitrary monitor IDs.
  const snapshot = Object.fromEntries(Object.entries(profile.monitors || {}).map(([id, previous]) => {
    const level = Object.prototype.hasOwnProperty.call(levels, id) ? levels[id] : previous
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 100)
      throw new Error('invalid-levels')
    return [id, level]
  }))
  if (!Object.keys(snapshot).length) throw new Error('no-monitors')
  return { ...profile, name, monitors: snapshot }
}

function isPresetActive(profile, monitors) {
  const connected = Object.values(monitors || {}).filter(monitor =>
    Object.prototype.hasOwnProperty.call(profile.monitors || {}, monitor.id))
  return connected.length > 0 && connected.every(monitor =>
    Number.isFinite(monitor.brightness) && Number.isFinite(profile.monitors[monitor.id]) &&
    Math.abs(monitor.brightness - profile.monitors[monitor.id]) < 0.5)
}

module.exports = { captureBrightness, makeQuickPreset, updateQuickPreset, isPresetActive }
