import { useEffect, useRef, useState } from 'react'
import { adminFetch } from './api'

const blank = { studentName: '', domain: '', rating: '', reviewText: '', avatarUrl: '' }
const validUrl = value => {
  if (!value) return true
  try { const url = new URL(value); return /^https?:\/\//i.test(value) && !url.username && !url.password && !/\s/.test(value) } catch { return false }
}

export function StudentReviewsAdmin() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState('')
  const [verification, setVerification] = useState(null)
  const [evidence, setEvidence] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const nameInput = useRef(null)
  useEffect(() => {
    let active = true
    adminFetch('/student-reviews').then(data => {
      if (!Array.isArray(data)) throw new Error('Invalid review list response.')
      if (active) { setItems(data); setLoadError('') }
    }).catch(err => { if (active) setLoadError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])
  const reset = () => { setEditing(''); setForm(blank) }
  const refresh = () => { setVerification(null); setEvidence(''); setLoading(true); setAttempt(value => value + 1) }
  const mutate = async (path, body, method, success) => {
    if (busy) return false
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await adminFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      setItems(previous => method === 'DELETE' ? previous.filter(item => path !== `/student-reviews/${item._id}`) : previous.some(item => item._id === saved._id) ? previous.map(item => item._id === saved._id ? saved : item) : [saved, ...previous])
      setMessage(success); window.dispatchEvent(new Event('innovix-content-change')); return true
    } catch (err) { setError(err.message); return false } finally { setBusy(false) }
  }
  const save = async event => {
    event.preventDefault()
    if (!form.studentName.trim() || !form.domain.trim() || !form.reviewText.trim() || !Number.isInteger(Number(form.rating)) || Number(form.rating) < 1 || Number(form.rating) > 5) { setError('Enter a name, domain, review and a rating from 1 to 5.'); return }
    if (!validUrl(form.avatarUrl)) { setError('Avatar URL must use HTTP(S), without credentials or spaces.'); return }
    const payload = { ...form, studentName: form.studentName.trim(), domain: form.domain.trim(), reviewText: form.reviewText.trim(), rating: Number(form.rating) }
    if (await mutate(editing ? `/student-reviews/${editing}` : '/student-reviews', payload, editing ? 'PUT' : 'POST', 'Review saved. Approval and verification are required before publication.')) reset()
  }
  const blocked = busy || loading || Boolean(loadError)
  return <section className="admin-page"><span className="eyebrow">Content management</span><h1>Student Reviews</h1>
    <p>Only approved, enabled and explicitly verified reviews appear publicly. Saving review content clears approval and verification.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-notice" role="status">{message}</p>}
    <form className="admin-editor" onSubmit={save}><h2>{editing ? 'Edit review' : 'Add review'}</h2><fieldset disabled={blocked || Boolean(verification)} style={{ border: 0, padding: 0, margin: 0 }}><div className="admin-form-grid">
      <label>Student name<input ref={nameInput} required maxLength={120} value={form.studentName} onChange={e => setForm({ ...form, studentName: e.target.value })} /></label>
      <label>Internship domain<input required maxLength={120} value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} /></label>
      <label>Rating<select required value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })}><option value="">Select rating</option>{[1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{n} / 5</option>)}</select></label>
      <label>Avatar URL (optional)<input type="url" maxLength={2048} value={form.avatarUrl} onChange={e => setForm({ ...form, avatarUrl: e.target.value })} /></label>
      <label className="admin-span">Review text<textarea required maxLength={2000} rows={4} value={form.reviewText} onChange={e => setForm({ ...form, reviewText: e.target.value })} /></label>
    </div><div className="admin-actions"><button className="admin-button dark">{busy ? 'Saving...' : 'Save review'}</button>{editing && <button type="button" className="admin-button light" onClick={reset}>Cancel edit</button>}</div></fieldset></form>
    {verification && <form className="admin-editor" onSubmit={async e => {
      e.preventDefault()
      if (!evidence.trim()) { setError('Enter the evidence you actually checked.'); return }
      if (!window.confirm(`Confirm you checked this review from ${verification.studentName} against the evidence entered?`)) return
      if (await mutate(`/student-reviews/${verification._id}/verify`, { evidence: evidence.trim(), updatedAt: verification.updatedAt }, 'POST', 'Review verified. Approval and visibility remain separate.')) { setVerification(null); setEvidence('') }
    }}><h2>Verify review</h2><p><b>{verification.studentName}</b> ? {verification.domain} ? {verification.rating} / 5</p><blockquote>{verification.reviewText}</blockquote><p>Record an evidence reference or summary you personally checked. This stays private to administrators. If the review changed, reload and inspect it again.</p><label>Verification evidence<textarea required maxLength={2000} rows={4} disabled={busy} value={evidence} onChange={e => setEvidence(e.target.value)} /></label><div className="admin-actions"><button className="admin-button dark" disabled={busy}>Confirm verification</button><button type="button" className="admin-button light" disabled={busy} onClick={() => { setVerification(null); setEvidence('') }}>Cancel</button></div></form>}
    <button className="admin-button light" disabled={busy || loading} onClick={refresh}>Reload reviews</button>
    {loading ? <p role="status">Loading reviews...</p> : loadError ? <p className="admin-error" role="alert">{loadError}</p> : <><h2>Reviews ({items.length})</h2>{!items.length && <p>No reviews yet.</p>}{items.map(item => <article className="admin-record" key={item._id}>
      <h3>{item.studentName}</h3><p>{item.domain} ? {item.rating} / 5</p><p>{item.reviewText}</p><p>Approval: {item.approved ? 'Approved' : 'Unapproved'} ? Visibility: {item.enabled ? 'Enabled' : 'Disabled'} ? Verification: {item.verified ? 'Verified' : 'Unverified'}</p>
      {item.verified && <details><summary>Private verification record</summary><p>{item.verificationEvidence}</p><p>Verified at: {item.verifiedAt}</p></details>}
      <div className="admin-actions">
        <button className="admin-button light" disabled={blocked || Boolean(verification)} onClick={() => { setEditing(item._id); setForm(Object.fromEntries(Object.keys(blank).map(key => [key, item[key] ?? blank[key]]))); setError(''); setMessage(''); nameInput.current?.focus() }}>Edit</button>
        <button className="admin-button light" disabled={blocked || Boolean(verification) || Boolean(editing)} onClick={() => mutate(`/student-reviews/${item._id}`, { approved: !item.approved }, 'PATCH', 'Approval updated. Verification is unchanged.')}>{item.approved ? 'Unapprove' : 'Approve'}</button>
        <button className="admin-button light" disabled={blocked || Boolean(verification) || Boolean(editing)} onClick={() => mutate(`/student-reviews/${item._id}`, { enabled: !item.enabled }, 'PATCH', 'Visibility updated.')}>{item.enabled ? 'Disable' : 'Enable'}</button>
        <button className="admin-button light" disabled={blocked || Boolean(verification) || Boolean(editing)} onClick={() => {
          if (item.verified) { if (window.confirm('Revoke verification for this review?')) mutate(`/student-reviews/${item._id}`, { verified: false }, 'PATCH', 'Verification revoked.') }
          else { setVerification(item); setEvidence(''); setError(''); setMessage('') }
        }}>{item.verified ? 'Revoke verification' : 'Verify with evidence'}</button>
        <button className="admin-button light" disabled={blocked || Boolean(verification)} onClick={async () => { if (window.confirm(`Delete the review from ${item.studentName} permanently?`) && await mutate(`/student-reviews/${item._id}`, undefined, 'DELETE', 'Review deleted.')) { if (editing === item._id) reset() } }}>Delete</button>
      </div></article>)}</>}
  </section>
}
