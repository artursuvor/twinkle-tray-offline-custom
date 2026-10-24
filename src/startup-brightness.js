// Apply the early-login floor once per display, allowing late DDC discovery.
// User input cancels the policy immediately; it never enforces a nightly lock.
class StartupBrightness {
  constructor(started = new Date(), timeoutMS = 120000) {
    this.enabled = started.getHours() < 7
    this.deadline = started.getTime() + timeoutMS
    this.applied = new Set()
  }

  active(now = Date.now()) {
    return this.enabled && now < this.deadline
  }

  cancel() {
    this.enabled = false
  }

  apply(monitors, setLevel, now = Date.now()) {
    if (!this.active(now)) return false
    let changed = false
    for (const monitor of Object.values(monitors)) {
      if (!monitor?.id || this.applied.has(monitor.id)) continue
      if (setLevel(monitor, 0) !== true) continue
      this.applied.add(monitor.id)
      changed = true
    }
    return changed
  }
}

module.exports = { StartupBrightness }
