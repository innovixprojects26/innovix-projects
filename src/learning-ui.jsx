import { useState } from 'react'
import { API_BASE, getAdminToken } from './api'
import './learning.css'

export function LearningState({ state }) { return <>{state.loading && <div className="learning-skeleton" role="status">Loading your workspace...</div>}{state.error && <div className="learning-feedback" role="alert">{state.error} <button className="button button-outline" onClick={state.refresh}>Retry</button></div>}{state.feedback && <p className="learning-feedback" role="status">{state.feedback}</p>}</> }
export function StatusBadge({ value }) { return <span className="learning-badge" data-status={value}>{value === 'Resubmit' ? 'Changes Requested' : value}</span> }
export function LearningForm({ fields, initial, onSave, onCancel, busy, submitLabel = 'Save changes' }) {
  const [form, setForm] = useState(initial)
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  return <form className="learning-form" onSubmit={event => { event.preventDefault(); onSave(form) }}><div className="learning-form-grid">{fields.map(({ key, label, type = 'text', options = [], required = false, ...props }) => <label key={key} className={type === 'textarea' ? 'learning-wide' : ''}><span>{label}</span>{type === 'select' ? <select value={form[key] || ''} required={required} onChange={event => change(key, event.target.value)}><option value="">Choose...</option>{options.map(option => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}</select> : type === 'checkbox' ? <input type="checkbox" checked={Boolean(form[key])} onChange={event => change(key, event.target.checked)} /> : type === 'checks' ? <span className="learning-checks">{options.map(option => <span key={option.value ?? option}><input aria-label={option.label ?? option} type="checkbox" checked={(form[key] || []).includes(option.value ?? option)} onChange={event => change(key, event.target.checked ? [...(form[key] || []), option.value ?? option] : form[key].filter(value => value !== (option.value ?? option)))} />{option.label ?? option}</span>)}</span> : type === 'textarea' ? <textarea {...props} required={required} value={form[key] || ''} onChange={event => change(key, event.target.value)} /> : <input {...props} type={type} required={required} value={['date', 'datetime-local'].includes(type) ? String(form[key] || '').slice(0, type === 'date' ? 10 : 16) : form[key] ?? ''} onChange={event => change(key, type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}</label>)}</div><div className="learning-actions"><button className="button button-dark" disabled={busy}>{busy ? 'Saving...' : submitLabel}</button>{onCancel && <button type="button" className="button button-outline" onClick={onCancel}>Cancel</button>}</div></form>
}
export function LearningTable({ columns, rows, empty = 'No records yet.' }) {
  return <div className="learning-table"><table><thead><tr>{columns.map(column => <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row._id || row.studentId}>{columns.map(column => <td key={column.label}>{column.render(row)}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="learning-empty">{empty}</p>}</div>
}
export function LearningAdminPage({ title, state, children }) { return <section className="admin-page learning-page"><span className="eyebrow">Innovix management</span><h1>{title}</h1><LearningState state={state} />{!state.error && children}</section> }
export function LearningUpload({ taskId, admin = false, csrfToken, onUploaded }) {
  const [percent, setPercent] = useState(null), [message, setMessage] = useState('')
  const upload = event => {
    const file = event.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setMessage('File limit is 10 MB.'); return }
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${API_BASE}/${admin ? 'admin' : 'student'}/learning/tasks/${taskId}/file`)
    xhr.withCredentials = !admin
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.setRequestHeader(admin ? 'Authorization' : 'X-CSRF-Token', admin ? `Bearer ${getAdminToken()}` : csrfToken)
    xhr.upload.onprogress = event => { if (event.lengthComputable) setPercent(Math.round(event.loaded / event.total * 100)) }
    xhr.onload = () => { setPercent(null); let body; try { body = JSON.parse(xhr.responseText) } catch { setMessage('Upload failed. Please try again.'); return } if (xhr.status >= 400 || !body.success) { setMessage(body.message || 'Upload failed.'); return } setMessage(`Uploaded ${body.data.originalName}`); onUploaded(body.data) }
    xhr.onerror = () => { setPercent(null); setMessage('Upload interrupted. Please retry.') }
    setMessage(''); setPercent(0); xhr.send(file)
  }
  return <div className="learning-upload"><label>File attachment (PDF, PNG, JPG or TXT, up to 10 MB)<input aria-label="Upload task file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={percent !== null} onChange={upload} /></label>{percent !== null && <><progress value={percent} max="100" /><span role="status">Uploading {percent}%</span></>}{message && <p role="status">{message}</p>}</div>
}
export function LearningFileLink({ id, admin = false }) {
  const [error, setError] = useState('')
  const download = async () => {
    try {
      const response = await fetch(`${API_BASE}/${admin ? 'admin' : 'student'}/learning/files/${id}`, { credentials: admin ? 'omit' : 'include', headers: admin ? { Authorization: `Bearer ${getAdminToken()}` } : {} })
      if (!response.ok) throw Error('File unavailable or access denied.')
      const blob = URL.createObjectURL(await response.blob()), link = document.createElement('a')
      link.href = blob; link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'attachment'; link.click(); setTimeout(() => URL.revokeObjectURL(blob), 1000)
    } catch (err) { setError(err.message) }
  }
  return <><button className="text-link" onClick={download}>Open attachment</button>{error && <span role="alert">{error}</span>}</>
}
