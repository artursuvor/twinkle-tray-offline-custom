import React, { useEffect, useState } from 'react'
import { isPresetActive } from '../quick-presets'
import '../quick-presets.css'

export default function QuickPresets({ monitors, beforeApply }) {
  const [profiles, setProfiles] = useState(window.settings?.profiles || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onSettings = event => setProfiles(event.detail.profiles || [])
    window.addEventListener('settingsUpdated', onSettings)
    return () => window.removeEventListener('settingsUpdated', onSettings)
  }, [])

  const apply = async id => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      beforeApply()
      const result = await window.ipc.invoke('quick-preset', { action: 'apply', id })
      if (!result.ok) setError('Не удалось применить пресет.')
    } catch (error) {
      setError('Не удалось применить пресет.')
    } finally {
      setBusy(false)
    }
  }

  const saved = profiles.filter(profile => profile.setBrightness && profile.showInMenu)
  if (!saved.length) return null

  return <section className="quick-presets" aria-label="Пресеты яркости">
    <div className="quick-presets-list">
      {saved.map(profile => <button key={profile.uuid} type="button" className="quick-preset-apply"
        disabled={busy} aria-pressed={isPresetActive(profile, monitors)}
        title={[profile.name, ...Object.entries(profile.monitors || {}).map(([id, level]) => {
          const monitor = Object.values(monitors || {}).find(item => item.id === id)
          return `${monitor?.name || 'Отключённый монитор'}: ${Math.round(level)}%`
        })].join('\n')}
        onClick={() => apply(profile.uuid)}>{profile.name || 'Без названия'}</button>)}
    </div>
    {error && <div className="quick-preset-error" role="alert">{error}</div>}
  </section>
}
