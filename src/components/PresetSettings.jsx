import React, { useEffect, useState } from 'react'
import { SettingsOption, SettingsChild } from './SettingsOption'
import '../preset-settings.css'

const errors = {
  'invalid-name': 'Введите название от 1 до 80 символов.',
  'duplicate-name': 'Пресет с таким названием уже есть.',
  'invalid-levels': 'Яркость должна быть от 0 до 100%.',
  'no-monitors': 'Нет доступных мониторов с регулировкой яркости.',
  'missing-profile': 'Пресет уже удалён.'
}

async function send(action, values = {}) {
  const result = await window.ipc.invoke('quick-preset', { action, ...values })
  if (!result.ok) throw new Error(errors[result.error] || 'Не удалось сохранить изменения.')
}

function PresetCard({ profile, monitors }) {
  const [name, setName] = useState(profile.name)
  const [levels, setLevels] = useState(profile.monitors || {})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const storedLevels = JSON.stringify(profile.monitors || {})

  useEffect(() => {
    setName(profile.name)
    setLevels(JSON.parse(storedLevels))
  }, [profile.name, storedLevels])

  const run = async action => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await send(action, { id: profile.uuid, name, levels: action === 'overwrite' ? undefined : levels })
      setConfirmDelete(false)
      setMessage('Сохранено')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const dirty = name !== profile.name || JSON.stringify(levels) !== storedLevels
  return <SettingsOption title={profile.name} expandable={true} className="preset-settings-card win10-has-background"
    description={Object.values(profile.monitors || {}).map(level => `${Math.round(level)}%`).join(' · ')}>
    <SettingsChild>
      <form className="preset-settings-editor" onSubmit={event => { event.preventDefault(); run('update') }}>
        <label className="preset-settings-name">Название
          <input type="text" value={name} maxLength={80} required onChange={event => setName(event.target.value)} />
        </label>
        {Object.entries(levels).map(([id, level], index) => {
          const monitor = Object.values(monitors || {}).find(item => item.id === id)
          const label = monitor?.name || `Отключённый монитор ${index + 1}`
          return <div className="preset-settings-level" key={id}>
            <span>{label}</span>
            <input type="range" aria-label={`${label}: яркость`} min="0" max="100" step="1" value={level}
              onChange={event => setLevels(previous => ({ ...previous, [id]: Number(event.target.value) }))} />
            <span className="preset-settings-number"><input type="number" aria-label={`${label}: процент яркости`}
              min="0" max="100" step="any" required value={level} onChange={event => {
                const value = event.target.value
                setLevels(previous => ({ ...previous, [id]: value === '' ? '' : Number(value) }))
              }} />%</span>
          </div>
        })}
        <div className="preset-settings-actions">
          <button type="submit" className="button button-primary" disabled={busy || !dirty || !name.trim()}>Сохранить</button>
          <button type="button" className="button" disabled={busy} onClick={() => run('overwrite')}>Взять текущую яркость</button>
          <button type="button" className="button" disabled={busy} onClick={() => confirmDelete ? run('delete') : setConfirmDelete(true)}>
            {confirmDelete ? 'Подтвердить удаление' : 'Удалить'}</button>
          {confirmDelete && <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Отмена</button>}
        </div>
        {message && <div className="preset-settings-status" role="status">{message}</div>}
      </form>
    </SettingsChild>
  </SettingsOption>
}

export default function PresetSettings({ monitors }) {
  const [profiles, setProfiles] = useState(window.settings?.profiles || [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const onSettings = event => setProfiles(event.detail.profiles || [])
    window.addEventListener('settingsUpdated', onSettings)
    return () => window.removeEventListener('settingsUpdated', onSettings)
  }, [])

  const create = async event => {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    setMessage('')
    try {
      await send('save', { name })
      setName('')
      setMessage('Пресет добавлен')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const saved = profiles.filter(profile => profile.quickPreset)
  return <div className="pageSection preset-settings">
    <div className="sectionTitle">Пресеты</div>
    <p>Сохраните текущую яркость мониторов. Пресеты появятся под ползунками в панели.</p>
    <form className="preset-settings-create" onSubmit={create}>
      <input type="text" aria-label="Название нового пресета" placeholder="Название пресета" maxLength={80}
        value={name} required onChange={event => setName(event.target.value)} />
      <button type="submit" className="button button-primary" disabled={busy || !name.trim()}>Добавить</button>
    </form>
    {message && <div className="preset-settings-status" role="status">{message}</div>}
    <div className="preset-settings-list">
      {saved.map(profile => <PresetCard key={profile.uuid} profile={profile} monitors={monitors} />)}
    </div>
  </div>
}
