import { useEffect, useRef, useState } from 'react'
import { adminFetch } from './api'

const categories = ['Hackathon', 'Webinar', 'Workshop', 'Tech Competition']
const blank = { title: '', category: 'Hackathon', description: '', eventDate: '', posterUrl: '', registrationUrl: '', isFree: false, enabled: false, status: 'draft' }
const validUrl = value => {
  if (!value) return true
  try { const url = new URL(value); return /^https?:\/\//i.test(value) && !url.username && !url.password && !/\s/.test(value) } catch { return false }
}

export function EventsAdmin() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const titleInput = useRef(null)
  useEffect(() => {
    let active = true
    adminFetch('/events').then(data => {
      if (!Array.isArray(data)) throw new Error('Invalid event list response.')
      if (active) { setItems(data); setLoadError('') }
    }).catch(err => { if (active) setLoadError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])
  const reset = () => { setEditing(''); setForm(blank); setError('') }
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const notify = () => window.dispatchEvent(new Event('innovix-content-change'))
  const save = async event => {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    if (!form.title.trim() || !form.description.trim()) { setError('Enter a title and description.'); return }
    if (!validUrl(form.posterUrl) || !validUrl(form.registrationUrl)) { setError('Use HTTP or HTTPS URLs without credentials or spaces.'); return }
    const date = new Date(`${form.eventDate}Z`)
    if (!form.eventDate || !Number.isFinite(date.getTime())) { setError('Enter a valid event date and time in UTC.'); return }
    setBusy(true)
    try {
      const payload = { ...form, title: form.title.trim(), description: form.description.trim(), eventDate: date.toISOString() }
      const saved = await adminFetch(editing ? `/events/${editing}` : '/events', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      setItems(previous => editing ? previous.map(item => item._id === editing ? saved : item) : [saved, ...previous])
      reset(); setMessage('Event saved. Only enabled, published events appear publicly.'); notify()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const remove = async item => {
    if (busy || !window.confirm(`Delete “${item.title}” permanently?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await adminFetch(`/events/${item._id}`, { method: 'DELETE' })
      setItems(previous => previous.filter(row => row._id !== item._id))
      if (editing === item._id) reset()
      setMessage('Event deleted.'); notify()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="admin-page"><span className="eyebrow">Content management</span><h1>Upcoming Events</h1>
    <p>Publish event cards on the Internship Page. Free / paid is display information only.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-notice" role="status">{message}</p>}
    <form className="admin-editor" onSubmit={save} aria-busy={busy}><h2>{editing ? 'Edit event' : 'Add event'}</h2>
      <fieldset disabled={busy || loading || Boolean(loadError)} style={{ border: 0, padding: 0, margin: 0 }}><div className="admin-form-grid">
        <label>Event title<input ref={titleInput} required maxLength={160} value={form.title} onChange={event => change('title', event.target.value)} /></label>
        <label>Category<select value={form.category} onChange={event => change('category', event.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="admin-span">Description<textarea required maxLength={2000} rows={4} value={form.description} onChange={event => change('description', event.target.value)} /></label>
        <label>Event date and time (UTC)<input type="datetime-local" step="0.001" required value={form.eventDate} onChange={event => change('eventDate', event.target.value)} /></label>
        <label>Poster image URL (optional)<input type="url" maxLength={2048} value={form.posterUrl} onChange={event => change('posterUrl', event.target.value)} /></label>
        <label>Registration URL (optional)<input type="url" maxLength={2048} value={form.registrationUrl} onChange={event => change('registrationUrl', event.target.value)} /></label>
        <label>Free / paid display<select value={form.isFree ? 'free' : 'paid'} onChange={event => change('isFree', event.target.value === 'free')}><option value="paid">Paid</option><option value="free">Free</option></select></label>
        <label>Publication status<select value={form.status} onChange={event => change('status', event.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <label>Visibility<select value={form.enabled ? 'enabled' : 'disabled'} onChange={event => change('enabled', event.target.value === 'enabled')}><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></label>
      </div><div className="admin-actions"><button className="admin-button dark">{busy ? 'Saving...' : 'Save event'}</button>{editing && <button type="button" className="admin-button light" onClick={reset}>Cancel edit</button>}</div></fieldset>
    </form>
    {loading ? <p role="status">Loading events...</p> : loadError ? <div className="admin-error" role="alert">{loadError} <button className="admin-button light" onClick={() => { setLoading(true); setAttempt(value => value + 1) }}>Retry</button></div> : <>
      <h2>Event list ({items.length})</h2>{!items.length && <p className="admin-empty">No events yet. Add a draft above to get started.</p>}
      {items.map(item => <article className="admin-record" key={item._id}><span className="status">{item.category} · {item.status} · {item.enabled ? 'Enabled' : 'Disabled'} · {item.isFree ? 'Free' : 'Paid'}</span><h3>{item.title}</h3><p>{item.description}</p><p>{new Date(item.eventDate).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</p><div className="admin-actions"><button className="admin-button light" disabled={busy} onClick={() => { setEditing(item._id); setForm(Object.fromEntries(Object.keys(blank).map(key => [key, key === 'eventDate' ? new Date(item.eventDate).toISOString().slice(0, -1) : item[key] ?? blank[key]]))); setError(''); setMessage(''); titleInput.current?.focus() }}>Edit</button><button className="admin-button light" disabled={busy} onClick={() => remove(item)}>Delete</button></div></article>)}
    </>}
  </section>
}
