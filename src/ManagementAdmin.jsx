import { approvedInternshipTracks, internshipDisplayName } from './approved-internships.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { validLiveClassUrl } from '../shared/internship-domain'
import { adminFetch } from './api'

const label = key => key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase())
const settingsLabels = { internshipPaymentsEnabled: 'Payment feature (Razorpay remains OFF until separately activated)', batchesEnabled: 'Internship Batch System', tasksEnabled: 'Tasks & Assignments', certificateVerificationEnabled: 'Certificates & Public Verification', notificationsEnabled: 'Student Notifications', gamificationEnabled: 'Gamification', leaderboardEnabled: 'Leaderboard (requires Gamification)', newsEnabled: 'News (all news and discoveries)', internshipsEnabled: 'Internships section', discoverEnabled: 'Learn & Discover', discoverImportEnabled: 'External Content Import', discoverPublishingMode: 'External Content Publishing', projectsEnabled: 'Projects section', projectEnquiriesEnabled: 'Accept project enquiries', customRequestsEnabled: 'Accept custom project requests', internshipApplicationsEnabled: 'Internship applications', techNewsEnabled: 'Daily Tech News section', testimonialsEnabled: 'Testimonials section', contactEnabled: 'Contact form', whatsapp: 'WhatsApp number (country code + digits)' }
export function Switch({ title, checked, onChange, disabled = false }) { return <label className="management-switch"><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{title}</span><b>{checked ? 'ON' : 'OFF'}</b></label> }
function Frame({ title, children, error, message }) { return <section className="admin-page"><span className="eyebrow">Central management</span><h1>{title}</h1>{error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-notice" role="status">{message}</p>}{children}</section> }
function useRecords(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => { let active = true; adminFetch(path).then(value => { if (active) { setData(value); setError('') } }).catch(err => { if (active) setError(err.message) }); return () => { active = false } }, [path, version])
  const save = async (url, body, method = 'PUT') => { setBusy(true); setError(''); setMessage(''); try { await adminFetch(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); setMessage('Changes saved.'); setVersion(value => value + 1); window.dispatchEvent(new Event('innovix-content-change')); return true } catch (err) { setError(err.message); return false } finally { setBusy(false) } }
  return { data, error, message, busy, save, retry: () => setVersion(value => value + 1) }
}
function Pending({ state }) { return state.error ? <button className="admin-button light" onClick={state.retry}>Retry</button> : <p role="status">Loading...</p> }

export function ConfigurationAdmin({ section }) {
  const state = useRecords('/configuration')
  return <Frame title={section === 'settings' ? 'Website Settings' : section === 'services' ? 'Services' : 'Homepage Content'} {...state}>{state.data ? <ConfigForm key={`${section}-${JSON.stringify(state.data[section])}`} section={section} initial={state.data[section]} state={state} /> : <Pending state={state} />}</Frame>
}
function ConfigForm({ section, initial, state }) {
  const [form, setForm] = useState(initial)
  return <form className="admin-editor" onSubmit={event => { event.preventDefault(); state.save(`/configuration/${section}`, form) }}><p>Changes become available through the website API without rebuilding. Open pages refresh settings automatically.</p>{section === 'settings' && <p>News controls the News hub, Daily Tech News and Learn &amp; Discover together. Their individual switches still apply. Internships controls the public section and new applications; enrolled students retain their learning resources.</p>}{section === 'services' ? <><div className="management-stack">{form.map((item, index) => <fieldset key={index}><legend>Service {index + 1}</legend><label>Title<input value={item.title} required maxLength={160} onChange={event => setForm(form.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} /></label><label>Description<textarea value={item.description} maxLength={2000} onChange={event => setForm(form.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} /></label><Switch title="Visible" checked={item.active} onChange={active => setForm(form.map((row, i) => i === index ? { ...row, active } : row))} /><button type="button" className="admin-button light" onClick={() => { if (window.confirm('Remove this service? Save to apply the change.')) setForm(form.filter((_, i) => i !== index)) }}>Remove</button></fieldset>)}</div><button type="button" className="admin-button light" onClick={() => setForm([...form, { title: '', description: '', active: true }])}>Add service</button></> : <div className="admin-form-grid">{Object.entries(form).map(([key, value]) => typeof value === 'boolean' ? <Switch key={key} title={settingsLabels[key] || label(key)} checked={value} onChange={next => setForm({ ...form, [key]: next })} /> : <label key={key}>{settingsLabels[key] || label(key)}{key === 'discoverPublishingMode' ? <select value={value} onChange={event => setForm({ ...form, [key]: event.target.value })}><option value="manual">Manual Approval</option><option value="auto">Auto Publish Trusted Sources</option></select> : ['heroSubtitle', 'aboutSummary', 'notice'].includes(key) ? <textarea value={value} maxLength={2000} onChange={event => setForm({ ...form, [key]: event.target.value })} /> : <input type={key.endsWith('Url') ? 'url' : key === 'supportEmail' ? 'email' : 'text'} value={value} maxLength={2000} onChange={event => setForm({ ...form, [key]: event.target.value })} />}</label>)}</div>}<button className="admin-button dark" disabled={state.busy}>{state.busy ? 'Saving...' : 'Save changes'}</button></form>
}

export function InternshipAdmin({ live = false }) {
  const state = useRecords('/internship-domains')
  return <Frame title={live ? 'Live Classes' : 'Internship Domains'} {...state}>{state.data ? <div className="management-stack">{approvedInternshipTracks(state.data).map(item => <DomainForm key={JSON.stringify(item)} item={item} live={live} state={state} />)}</div> : <Pending state={state} />}</Frame>
}
export function PaymentsAdmin() {
  const [filters, setFilters] = useState({ month: '', year: '', domain: '', paymentStatus: '', search: '' })
  const state = useRecords(`/learning/payments?${new URLSearchParams(filters)}`)
  const date = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '?'
  const options = state.data?.options || {}
  return <Frame title="Internship Enrollments / Payments" {...state}>
    <p>LIVE payments are OFF. Verified TEST payments unlock local learning. Dates and monthly groups use India Standard Time. Counts reflect the filters below.</p>
    <div className="admin-form-grid">
      {Object.entries({ month: Array.from({ length: 12 }, (_, i) => i + 1), year: options.years || [], domain: options.domains || [], paymentStatus: ['PAID', 'NOT_PAID'] }).map(([key, values]) => <label key={key}>{label(key)}<select value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })}><option value="">All</option>{values.map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}
      <label>Search student name or email<input value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
    </div>
    {!state.data ? <Pending state={state} /> : <>
      <p>Total enrollments: <strong>{state.data.summary.total}</strong> ? Paid: <strong>{state.data.summary.paid}</strong> ? Not Paid: <strong>{state.data.summary.notPaid}</strong></p>
      <section className="admin-record"><h2>Monthly enrollments</h2>{state.data.summary.monthly.map(item => <p key={item.name}>{item.name}: {item.count}</p>)}</section>
      <section className="admin-record"><h2>Domain enrollments</h2>{state.data.summary.domains.map(item => <p key={item.name}>{item.name}: {item.count}</p>)}</section>
      <div className="management-table"><table><thead><tr>{['Student', 'Domain / Batch', 'Enrolled (IST)', 'Payment', 'Learning access', 'Paid (IST)', 'Verified transaction'].map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{state.data.internships.map(item => <tr key={item._id}><td>{item.student?.fullName || '?'}<br />{item.student?.email || '?'}</td><td>{item.domain}<br />{item.batch?.code}</td><td>{date(item.createdAt)}</td><td>{item.paymentStatus}<br />{item.paymentMode}{item.fee == null ? '' : ` ? ?${item.fee.toLocaleString('en-IN')}`}</td><td>{item.learningAccessStatus}</td><td>{date(item.paymentDate)}</td><td>{item.transactionReference || '?'}</td></tr>)}</tbody></table></div>
      {!state.data.internships.length && <p>No matching internship enrollments.</p>}
      <section className="admin-record"><h2>Project payments</h2><p>No project payment records exist.</p></section>
    </>}
  </Frame>
}

function DomainForm({ item, live, state }) {
  const [form, setForm] = useState({ price: 499, ...item })
  const keys = live ? ['classTitle', 'meetingUrl', 'date', 'startTime', 'description', 'classActive'] : ['price', 'active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled']
  return <form className="admin-editor" onSubmit={event => { event.preventDefault(); state.save(`/internship-domains/${item._id}`, Object.fromEntries(keys.map(key => [key, form[key] ?? ''])), 'PATCH') }}><h2>{item.name}</h2>{form.liveClassEnabled && !validLiveClassUrl(form.meetingUrl) && <p role="status">Live Classes is ON. Configure a valid Live Class URL to show Join Live Class.{!live && <> <Link className="text-link" to="/admin/live-classes">Configure Live Class URL</Link></>}</p>}{!live && <p>Manage lessons in Course Videos. Prices are in INR. Razorpay is OFF; payment is not required for approved learning access.</p>}<div className="admin-form-grid">{keys.map(key => typeof form[key] === 'boolean' ? <Switch key={key} title={label(key)} checked={form[key]} onChange={value => setForm({ ...form, [key]: value })} /> : <label key={key}>{label(key)}<input type={key === 'price' ? 'number' : key === 'meetingUrl' ? 'url' : key === 'date' ? 'date' : key === 'startTime' ? 'time' : 'text'} value={form[key] ?? ''} min={key === 'price' ? 0 : undefined} step={key === 'price' ? '0.01' : undefined} required={key === 'price'} maxLength={2000} onChange={event => setForm({ ...form, [key]: key === 'price' ? Number(event.target.value) : event.target.value })} /></label>)}</div><button className="admin-button dark" disabled={state.busy}>Save {live ? 'live class' : 'internship'}</button></form>
}

function localDateValue() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function receiptDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

function rupees(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100)
}

function OfflinePaymentAccess({ student }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [domain, setDomain] = useState('')
  const [accessOption, setAccessOption] = useState('offline')
  const [freeReason, setFreeReason] = useState('')
  const [freeConfirmed, setFreeConfirmed] = useState(false)
  const [freeRequestId, setFreeRequestId] = useState('')
  const [customAgreement, setCustomAgreement] = useState({ agreedAmountRupees: '', internalNote: '' })
  const [customRequestId, setCustomRequestId] = useState('')
  const [confirmingPaymentId, setConfirmingPaymentId] = useState('')
  const [customPaymentConfirmation, setCustomPaymentConfirmation] = useState({ amountRupees: '', method: 'UPI', transactionReference: '', paymentDate: localDateValue(), confirmReceived: false })
  const [form, setForm] = useState({ amountRupees: '', method: 'UPI', transactionReference: '', paymentDate: localDateValue(), internalNote: '', confirmReceived: false, idempotencyKey: '' })
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    adminFetch(`/students/${student._id}/offline-access`).then(data => {
      if (!active) return
      setDetails(data)
      setDomain(current => current || data.domains?.find(item => item.name === data.student?.internshipDomain)?.name || data.domains?.[0]?.name || '')
    }).catch(requestError => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [student._id, attempt])

  const selectedDomain = details?.domains?.find(item => item.name === domain)
  const enrollment = details?.enrollments?.find(item => item.domain === domain)
  const history = details?.enrollments?.flatMap(item => item.offlinePayments.map(payment => ({ ...payment, domain: item.domain, enrollmentId: item._id }))).filter(item => item.domain === domain) || []
  const customHistory = details?.enrollments?.flatMap(item => item.customPayments.map(payment => ({ ...payment, domain: item.domain, enrollmentId: item._id }))).filter(item => item.domain === domain) || []
  const activeAdminGrant = enrollment?.adminAccessGrants?.find(item => item.active)
  const auditHistory = details?.enrollments?.flatMap(item => item.auditHistory.map(event => ({ ...event, domain: item.domain }))).filter(item => item.domain === domain).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)) || []
  const refresh = () => setAttempt(value => value + 1)

  const savePayment = async event => {
    event.preventDefault()
    if (!selectedDomain || busy) return
    const amountText = rupees(Math.round(Number(form.amountRupees) * 100))
    if (!window.confirm(`Confirm offline payment for ${details.student.fullName}, ${selectedDomain.name}, ${amountText} by ${form.method}? Confirm only after the money was received and verified.`)) return
    const idempotencyKey = form.idempotencyKey || crypto.randomUUID()
    setForm(value => ({ ...value, idempotencyKey }))
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await adminFetch(`/students/${student._id}/offline-payments`, { method: 'POST', body: JSON.stringify({ ...form, domain: selectedDomain.name, idempotencyKey, confirmReceived: true }) })
      setNotice(result.duplicate ? 'This confirmation was already recorded; no duplicate payment or grant was created.' : 'Offline payment recorded. Payment history is available below.')
      setForm({ amountRupees: '', method: 'UPI', transactionReference: '', paymentDate: localDateValue(), internalNote: '', confirmReceived: false, idempotencyKey: '' })
      refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const grantFreeAccess = async event => {
    event.preventDefault()
    if (!selectedDomain || busy || !freeConfirmed) return
    if (!window.confirm(`Grant free access to ${internshipDisplayName(selectedDomain.name)} for ${details.student.fullName}? No payment will be recorded.`)) return
    const idempotencyKey = freeRequestId || crypto.randomUUID()
    setFreeRequestId(idempotencyKey); setBusy(true); setError(''); setNotice('')
    try {
      const result = await adminFetch(`/students/${student._id}/special-access/free`, { method: 'POST', body: JSON.stringify({ domain: selectedDomain.name, reason: freeReason, confirmGrant: true, idempotencyKey }) })
      setNotice(result.duplicate ? 'This free-access approval was already recorded.' : 'Free access approved for this internship only.')
      setFreeConfirmed(false); setFreeReason(''); setFreeRequestId(''); refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const saveCustomAgreement = async event => {
    event.preventDefault()
    if (!selectedDomain || busy) return
    if (!window.confirm(`Save a pending custom-payment agreement of ₹${customAgreement.agreedAmountRupees} for ${details.student.fullName} — ${internshipDisplayName(selectedDomain.name)}? Access remains locked until payment is confirmed.`)) return
    const idempotencyKey = customRequestId || crypto.randomUUID()
    setCustomRequestId(idempotencyKey); setBusy(true); setError(''); setNotice('')
    try {
      await adminFetch(`/students/${student._id}/custom-payments`, { method: 'POST', body: JSON.stringify({ domain: selectedDomain.name, ...customAgreement, idempotencyKey }) })
      setNotice('Pending custom-payment agreement saved. Learning access remains locked.')
      setCustomAgreement({ agreedAmountRupees: '', internalNote: '' }); setCustomRequestId(''); refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const confirmCustomPayment = async event => {
    event.preventDefault()
    const pending = customHistory.find(item => String(item._id) === confirmingPaymentId)
    if (!pending || !customPaymentConfirmation.confirmReceived || busy) return
    if (!window.confirm(`Confirm receipt of the agreed ₹${(pending.agreedAmountPaise / 100).toFixed(2)} from ${details.student.fullName} for ${internshipDisplayName(domain)} by ${customPaymentConfirmation.method}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await adminFetch(`/students/${student._id}/custom-payments/${pending._id}/confirm`, { method: 'POST', body: JSON.stringify({ ...customPaymentConfirmation, confirmReceived: true }) })
      setNotice(result.duplicate ? 'This custom payment was already verified.' : 'Custom payment verified; internship access granted.')
      setConfirmingPaymentId(''); setCustomPaymentConfirmation({ amountRupees: '', method: 'UPI', transactionReference: '', paymentDate: localDateValue(), confirmReceived: false }); refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const revokeSpecialAccess = async grant => {
    if (!grant?.active || busy) return
    const reason = window.prompt(`Reason for revoking ${internshipDisplayName(domain)} admin access from ${details.student.fullName}:`)
    if (!reason?.trim() || !window.confirm(`Revoke only this admin-approved ${domain} grant? Any independently verified Razorpay access remains available.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await adminFetch(`/students/${student._id}/special-access/${grant._id}/revoke`, { method: 'PATCH', body: JSON.stringify({ confirmRevoke: true, reason: reason.trim() }) })
      setNotice('Admin-approved access revoked. Approval/payment history remains available.')
      refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const revokeAccess = async () => {
    if (!enrollment?.offlineGrant?.active || busy) return
    const reason = window.prompt(`Reason for revoking ${domain} admin access from ${details.student.fullName}:`)
    if (!reason?.trim() || !window.confirm(`Revoke only admin-granted ${domain} access? Payment history remains, and independently verified Razorpay access is preserved.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await adminFetch(`/students/${student._id}/offline-access/${enrollment._id}/revoke`, { method: 'PATCH', body: JSON.stringify({ confirmRevoke: true, reason: reason.trim() }) })
      setNotice('Admin-granted access revoked. Payment history remains available.')
      refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  return <section className="admin-record" aria-label="Special Access Management">
    <h2>Special Access</h2>
    <p>Choose one access type for the selected student and internship. Every grant is checked and recorded by the server.</p>
    {loading && <p role="status">Loading enrollment and payment history...</p>}
    {error && <p className="admin-error" role="alert">{error} <button className="admin-button light" type="button" onClick={refresh}>Retry</button></p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {details && <>
      <dl className="admin-details"><div><dt>Student name</dt><dd>{details.student.fullName}</dd></div><div><dt>Registered email</dt><dd>{details.student.email}</dd></div><div><dt>Student account ID</dt><dd>{details.student.studentId}</dd></div><div><dt>Account status</dt><dd>{details.student.accountStatus}</dd></div></dl>
      <label className="offline-domain-select">Selected internship<select aria-label="Special access internship" value={domain} onChange={event => { setDomain(event.target.value); setConfirmingPaymentId('') }}><option value="">Choose an active internship</option>{details.domains.map(item => <option key={item._id} value={item.name}>{internshipDisplayName(item.name)}</option>)}</select></label>
      {selectedDomain && <>
        <div className="special-access-options" role="group" aria-label="Choose special access type">
          <button type="button" className={`admin-button ${accessOption === 'free' ? 'dark' : 'light'}`} aria-pressed={accessOption === 'free'} onClick={() => setAccessOption('free')}>Grant Free Access</button>
          <button type="button" className={`admin-button ${accessOption === 'custom' ? 'dark' : 'light'}`} aria-pressed={accessOption === 'custom'} onClick={() => setAccessOption('custom')}>Grant Custom Amount Access</button>
          <button type="button" className={`admin-button ${accessOption === 'offline' ? 'dark' : 'light'}`} aria-pressed={accessOption === 'offline'} onClick={() => setAccessOption('offline')}>Grant Offline Payment Access</button>
        </div>
        <dl className="admin-details offline-status-grid">
          <div><dt>Current enrollment</dt><dd>{enrollment ? `${enrollment.status} · ${enrollment.batchName || 'Batch'}` : 'No enrollment yet; eligibility is checked on confirmation.'}</dd></div>
          <div><dt>Existing verified online payment</dt><dd>{enrollment?.onlinePaymentVerified ? `Verified (${enrollment.razorpayStatus})` : `Not verified (${enrollment?.razorpayStatus || 'Not Paid'})`}</dd></div>
          <div><dt>Existing Razorpay order</dt><dd>{enrollment?.razorpayOrderId ? `Existing order · ${enrollment.razorpayStatus}; it will not be changed.` : 'No saved Razorpay order in this enrollment.'}</dd></div>
          <div><dt>Admin-granted access</dt><dd>{activeAdminGrant ? `${activeAdminGrant.accessSource === 'ADMIN_FREE_ACCESS' ? 'Admin Approved — Free Access' : 'Admin Approved — Custom Payment'} · Active` : enrollment?.offlineGrant?.active ? 'Offline payment access · Active' : enrollment?.offlineGrant ? `Offline grant revoked ${receiptDate(enrollment.offlineGrant.revokedAt)}` : 'Not granted'}</dd></div>
        </dl>
        {accessOption === 'free' && <form className="admin-editor offline-payment-form" onSubmit={grantFreeAccess}>
          <h3>Grant Free Access</h3>
          <p>Creates an admin approval only. It does not create a payment, order, or paid status.</p>
          <div className="admin-form-grid"><label className="admin-span">Optional approval reason<textarea maxLength="500" rows="3" value={freeReason} onChange={event => setFreeReason(event.target.value)} /></label></div>
          <div className="admin-checks"><label><input type="checkbox" required checked={freeConfirmed} onChange={event => setFreeConfirmed(event.target.checked)} />I approve free access to this internship for this student.</label></div>
          <button className="admin-button dark" disabled={busy || !freeConfirmed || Boolean(enrollment?.onlinePaymentVerified || enrollment?.offlineGrant?.active || activeAdminGrant)}>{busy ? 'Approving...' : 'Confirm Free Access'}</button>
        </form>}
        {accessOption === 'custom' && <>
          <form className="admin-editor offline-payment-form" onSubmit={saveCustomAgreement}>
            <h3>Grant Custom Amount Access</h3>
            <p>Save an agreement while payment is pending. Access stays locked until the agreed amount is received and confirmed.</p>
            <div className="admin-form-grid"><label>Agreed Amount (₹)<input type="number" min="0.01" max="1000000" step="0.01" required value={customAgreement.agreedAmountRupees} onChange={event => setCustomAgreement(value => ({ ...value, agreedAmountRupees: event.target.value }))} /></label><label className="admin-span">Internal Note (admin only)<textarea maxLength="1000" rows="3" value={customAgreement.internalNote} onChange={event => setCustomAgreement(value => ({ ...value, internalNote: event.target.value }))} /></label></div>
            <button className="admin-button dark" disabled={busy || Boolean(enrollment?.onlinePaymentVerified || enrollment?.offlineGrant?.active || activeAdminGrant)}>{busy ? 'Saving...' : 'Save Pending Agreement'}</button>
          </form>
          {!!customHistory.filter(item => item.status === 'Pending').length && <><h3>Pending custom agreements</h3>{customHistory.filter(item => item.status === 'Pending').map(item => <article className="admin-record" key={item._id}><strong>{rupees(item.agreedAmountPaise)} · Pending payment</strong><p>Access remains locked for {internshipDisplayName(domain)}.</p><button className="admin-button light" type="button" disabled={busy} onClick={() => { setConfirmingPaymentId(String(item._id)); setCustomPaymentConfirmation({ amountRupees: (item.agreedAmountPaise / 100).toFixed(2), method: 'UPI', transactionReference: '', paymentDate: localDateValue(), confirmReceived: false }) }}>Confirm payment received</button></article>)}</>}
          {confirmingPaymentId && <form className="admin-editor offline-payment-form" onSubmit={confirmCustomPayment}>
            <h3>Confirm Custom Payment Received</h3>
            <div className="admin-form-grid"><label>Actual Amount Received (₹)<input type="number" min="0.01" max="1000000" step="0.01" required value={customPaymentConfirmation.amountRupees} onChange={event => setCustomPaymentConfirmation(value => ({ ...value, amountRupees: event.target.value }))} /></label><label>Payment Method<select value={customPaymentConfirmation.method} onChange={event => setCustomPaymentConfirmation(value => ({ ...value, method: event.target.value }))}><option>UPI</option><option>Bank Transfer</option><option>Cash</option></select></label><label>Transaction Reference<input aria-label="Custom payment transaction reference" required={customPaymentConfirmation.method !== 'Cash'} maxLength="160" value={customPaymentConfirmation.transactionReference} onChange={event => setCustomPaymentConfirmation(value => ({ ...value, transactionReference: event.target.value }))} placeholder={customPaymentConfirmation.method === 'Cash' ? 'Optional for cash' : 'Required for UPI / bank transfer'} /></label><label>Payment Date<input type="date" required max={localDateValue()} value={customPaymentConfirmation.paymentDate} onChange={event => setCustomPaymentConfirmation(value => ({ ...value, paymentDate: event.target.value }))} /></label></div>
            <div className="admin-checks"><label><input type="checkbox" required checked={customPaymentConfirmation.confirmReceived} onChange={event => setCustomPaymentConfirmation(value => ({ ...value, confirmReceived: event.target.checked }))} />I confirm the agreed amount has actually been received and verified.</label></div>
            <button className="admin-button dark" disabled={busy || !customPaymentConfirmation.confirmReceived}>{busy ? 'Verifying...' : 'Confirm Received & Grant Access'}</button>
          </form>}
          {!!customHistory.filter(item => item.status === 'Admin Verified').length && <><h3>Custom payment history</h3><div className="management-table"><table><thead><tr><th>Status</th><th>Agreed / Received</th><th>Method / Reference</th><th>Payment date</th></tr></thead><tbody>{customHistory.filter(item => item.status === 'Admin Verified').map(item => <tr key={item._id}><td>Admin Approved — Custom Payment</td><td>{rupees(item.agreedAmountPaise)} / {rupees(item.amountPaise)}</td><td>{item.method}<br />{item.transactionReference || 'Cash'}</td><td>{receiptDate(item.paymentDate)}</td></tr>)}</tbody></table></div></>}
        </>}
        {accessOption === 'offline' && !enrollment?.onlinePaymentVerified && !enrollment?.offlineGrant?.active && !activeAdminGrant && <form className="admin-editor offline-payment-form" onSubmit={savePayment}>
          <h3>Confirm Offline Payment &amp; Grant Access</h3>
          <div className="admin-form-grid">
            <label>Amount Received (₹)<input aria-label="Amount Received (₹)" type="number" min="0.01" max="1000000" step="0.01" required value={form.amountRupees} onChange={event => setForm(value => ({ ...value, amountRupees: event.target.value }))} /></label>
            <label>Payment Method<select required value={form.method} onChange={event => setForm(value => ({ ...value, method: event.target.value }))}><option>UPI</option><option>Bank Transfer</option><option>Cash</option></select></label>
            <label>Transaction Reference<input aria-label="Transaction Reference" required={form.method !== 'Cash'} maxLength={160} value={form.transactionReference} onChange={event => setForm(value => ({ ...value, transactionReference: event.target.value }))} placeholder={form.method === 'Cash' ? 'Optional for cash' : 'Required for UPI / bank transfer'} /></label>
            <label>Payment Date<input aria-label="Payment Date" type="date" required max={localDateValue()} value={form.paymentDate} onChange={event => setForm(value => ({ ...value, paymentDate: event.target.value }))} /></label>
            <label className="admin-span">Internal Note (admin only)<textarea maxLength={1000} rows="3" value={form.internalNote} onChange={event => setForm(value => ({ ...value, internalNote: event.target.value }))} /></label>
          </div>
          <div className="admin-checks"><label><input type="checkbox" required checked={form.confirmReceived} onChange={event => setForm(value => ({ ...value, confirmReceived: event.target.checked }))} />I confirm that Innovix Projects has received and verified this payment.</label></div>
          <button className="admin-button dark" disabled={busy || !form.confirmReceived}>{busy ? 'Recording...' : 'Confirm Offline Payment & Grant Access'}</button>
        </form>}
        {activeAdminGrant && <div className="admin-actions"><span>{activeAdminGrant.accessSource === 'ADMIN_FREE_ACCESS' ? 'Free grant' : 'Custom payment grant'} approved {receiptDate(activeAdminGrant.approvedAt)}{activeAdminGrant.reason ? ` · ${activeAdminGrant.reason}` : ''}</span><button className="admin-button light" type="button" disabled={busy} onClick={() => revokeSpecialAccess(activeAdminGrant)}>Revoke Admin Access</button></div>}
        {enrollment?.offlineGrant?.active && <div className="admin-actions"><button className="admin-button light" type="button" disabled={busy} onClick={revokeAccess}>Revoke Offline Payment Access</button></div>}
        {!!history.length && <><h3>Offline payment history</h3><div className="management-table"><table><thead><tr><th>Status</th><th>Internship</th><th>Amount</th><th>Method / Reference</th><th>Payment date</th></tr></thead><tbody>{history.map(item => <tr key={item._id}><td>{item.status}</td><td>{internshipDisplayName(item.internshipTitle || item.domain)}</td><td>{rupees(item.amountPaise)}</td><td>{item.method}<br />{item.transactionReference || 'Cash (no reference)'}</td><td>{receiptDate(item.paymentDate)}</td></tr>)}</tbody></table></div></>}
        {enrollment?.offlineGrant?.active && <p>Admin access granted {receiptDate(enrollment.offlineGrant.grantedAt)}. Access is limited to {internshipDisplayName(domain)}.</p>}
        {!!auditHistory.length && <><h3>Payment and approval history</h3><ol className="offline-audit-history">{auditHistory.map((item, index) => <li key={`${item.action}-${item.paymentRecordId}-${item.occurredAt}-${index}`}><strong>{label(item.action)}</strong> · {receiptDate(item.occurredAt)} · {item.reason}</li>)}</ol></>}
      </>}
    </>}

  </section>
}

export function StudentsAdmin() {
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const state = useRecords('/students')
  const rows = (state.data || []).filter(item => (!status || item.accountStatus === status) && (!domain || item.internshipDomain === domain) && [item.studentId, item.fullName, item.email, item.college].join(' ').toLowerCase().includes(search.toLowerCase()))
  return <Frame title="Students" {...state}><div className="admin-toolbar"><input className="admin-search" aria-label="Search students" placeholder="Search name, email, student ID or college" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Internship domain" value={domain} onChange={event => setDomain(event.target.value)}><option value="">All domains</option>{[...new Set((state.data || []).map(item => item.internshipDomain))].map(value => <option key={value} value={value}>{internshipDisplayName(value)}</option>)}</select><select aria-label="Account status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>{!state.data ? <Pending state={state} /> : <><div className="management-table"><table><thead><tr>{['Student ID', 'Name / Email', 'Domain', 'Status', 'Registered', 'Actions'].map(value => <th key={value}>{value}</th>)}</tr></thead><tbody>{rows.map(item => <tr key={item._id}><td>{item.studentId}</td><td>{item.fullName}<br />{item.email}</td><td>{internshipDisplayName(item.internshipDomain)}</td><td>{item.accountStatus}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td><td><button className="admin-button light" onClick={() => setSelected(item)}>View profile</button><button className="admin-button light" disabled={state.busy} onClick={async () => { if (window.confirm(`${item.accountStatus === 'active' ? 'Suspend' : 'Activate'} ${item.fullName}? Existing sessions will be revoked.`)) { if (await state.save(`/students/${item._id}/account-status`, { accountStatus: item.accountStatus === 'active' ? 'suspended' : 'active' }, 'PATCH')) setSelected(null) } }}>{item.accountStatus === 'active' ? 'Suspend' : 'Activate'}</button></td></tr>)}</tbody></table></div>{!rows.length && <p className="admin-empty">No students match these filters.</p>}</>}{selected && <section className="admin-record" aria-label="Student profile"><h2>{selected.fullName}</h2><dl className="admin-details">{Object.entries(selected).filter(([key]) => key !== '_id').map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{key === 'createdAt' ? new Date(value).toLocaleString() : key === 'internshipDomain' ? internshipDisplayName(value) : value}</dd></div>)}</dl><OfflinePaymentAccess key={selected._id} student={selected} /><button className="admin-button light" onClick={() => setSelected(null)}>Close profile</button></section>}</Frame>
}

const blankAnnouncement = { title: '', message: '', type: 'Information', startDate: '', endDate: '', active: false }
export function AnnouncementsAdmin() {
  const state = useRecords('/announcements')
  const [form, setForm] = useState(blankAnnouncement)
  return <Frame title="Announcements" {...state}><form className="admin-editor" onSubmit={async event => { event.preventDefault(); if (await state.save(form._id ? `/announcements/${form._id}` : '/announcements', Object.fromEntries(Object.keys(blankAnnouncement).map(key => [key, form[key]])), form._id ? 'PUT' : 'POST')) setForm(blankAnnouncement) }}><h2>{form._id ? 'Edit announcement' : 'New announcement'}</h2><div className="admin-form-grid"><label>Title<input required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label>Type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>{['Information', 'Success', 'Warning', 'Important'].map(value => <option key={value}>{value}</option>)}</select></label><label className="admin-span">Message<textarea required maxLength={2000} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} /></label>{['startDate', 'endDate'].map(key => <label key={key}>{label(key)} (UTC)<input type="datetime-local" value={form[key] ? form[key].slice(0, 16) : ''} onChange={event => setForm({ ...form, [key]: event.target.value ? `${event.target.value}:00.000Z` : '' })} /></label>)}<Switch title="Active" checked={form.active} onChange={active => setForm({ ...form, active })} /></div><button className="admin-button dark" disabled={state.busy}>Save announcement</button>{form._id && <button className="admin-button light" type="button" onClick={() => setForm(blankAnnouncement)}>Cancel edit</button>}</form>{!state.data ? <Pending state={state} /> : state.data.length ? state.data.map(item => <article className="admin-record" key={item._id}><span className="status">{item.active ? 'Active' : 'Inactive'} · {item.type}</span><h2>{item.title}</h2><p>{item.message}</p><div className="admin-actions"><button className="admin-button light" onClick={() => setForm({ ...blankAnnouncement, ...item, startDate: item.startDate || '', endDate: item.endDate || '' })}>Edit / Preview</button><button className="admin-button light" disabled={state.busy} onClick={() => state.save(`/announcements/${item._id}`, { active: !item.active })}>{item.active ? 'Turn off' : 'Turn on'}</button><button className="admin-button light" disabled={state.busy} onClick={() => { if (window.confirm('Delete this announcement permanently?')) state.save(`/announcements/${item._id}`, undefined, 'DELETE') }}>Delete</button></div></article>) : <p className="admin-empty">No announcements yet.</p>}</Frame>
}
export function AdminSettings() {
  const state = useRecords('/profile')
  const log = useRecords('/activity')
  return <Frame title="Admin Settings" {...state}>{state.data ? <section className="admin-record"><h2>Administrator account</h2><p>{state.data.email} · {state.data.role}</p><p>This account provides access to every management module. Use the existing server administrator tools for credential changes; secrets are not stored in website settings.</p></section> : <Pending state={state} />}<h2>Admin activity</h2>{log.error && <p role="alert">{log.error}</p>}{log.data ? <div className="management-table"><table><thead><tr><th>Action</th><th>Target</th><th>Timestamp</th></tr></thead><tbody>{log.data.map(item => <tr key={item._id}><td>{item.action}</td><td>{item.target}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table>{!log.data.length && <p>No recorded actions yet.</p>}</div> : <Pending state={log} />}</Frame>
}
