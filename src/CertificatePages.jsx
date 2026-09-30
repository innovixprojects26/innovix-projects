import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from './api'
import { useSite } from './site-context'
import { certificateTypes } from '../shared/learning'
import { useLearning, dateLabel } from './learning-api'
import { LearningAdminPage, LearningForm, LearningState, LearningTable, StatusBadge } from './learning-ui'

export function CertificatesAdmin() {
  const state = useLearning('/certificates', true), catalog = useLearning('/catalog', true), [eligibility, setEligibility] = useState(null)
  return <LearningAdminPage title="Certificates" state={state}><LearningState state={catalog} /><p>Certificates require a completed batch, approved required tasks and completed required videos. Issuance always requires this explicit admin action.</p><LearningForm initial={{ enrollment: '', type: certificateTypes[0] }} fields={[{ key: 'enrollment', label: 'Completed Enrollment', required: true, type: 'select', options: (catalog.data?.enrollments || []).map(item => ({ value: item._id, label: `${item.student?.fullName} · ${item.student?.studentId} · ${item.batch?.name}` })) }, { key: 'type', label: 'Certificate Type', type: 'select', required: true, options: certificateTypes }]} busy={state.busy} submitLabel="Check Eligibility & Issue" onSave={async body => { const result = await state.act(`/eligibility/${body.enrollment}`, 'GET'); setEligibility(result); if (result?.eligible && window.confirm('Issue this official certificate to the selected student?')) await state.act('/certificates', 'POST', body) }} />{eligibility && <p role="status">{eligibility.eligible ? 'Eligible for issuance.' : eligibility.reasons.join(' ')}</p>}<LearningTable rows={state.data || []} columns={[{ label: 'Student', render: item => <>{item.studentName}<small>{item.studentId}</small></> }, { label: 'Certificate', render: item => <>{item.type}<small>{item.certificateId}</small><small>{item.batchName}</small></> }, { label: 'Status', render: item => <StatusBadge value={item.status} /> }, { label: 'Actions', render: item => <><Link className="text-link" to={`/verify/${item.certificateId}`}>Verification / QR destination</Link>{item.status === 'Active' && <button onClick={() => { if (window.confirm('Revoke this certificate? Its verification page will show Certificate Revoked.')) state.act(`/certificates/${item._id}/revoke`, 'POST', {}) }}>Revoke</button>}</> }]} /></LearningAdminPage>
}
export function VerifyCertificate() {
  const { certificateId } = useParams(), navigate = useNavigate(), { settings } = useSite()
  const [query, setQuery] = useState(certificateId || ''), [state, setState] = useState({ loading: Boolean(certificateId), data: null, error: '' })
  useEffect(() => {
    if (!certificateId || !settings.certificateVerificationEnabled) return
    let active = true
    apiFetch(`/certificates/verify/${encodeURIComponent(certificateId)}`).then(data => { if (active) setState({ id: certificateId, loading: false, data, error: '' }) }).catch(error => { if (active) setState({ id: certificateId, loading: false, data: null, error: error.message }) })
    return () => { active = false }
  }, [certificateId, settings.certificateVerificationEnabled])
  return <section className="section container learning-page certificate-page"><span className="eyebrow">Innovix Projects</span><h1>Certificate Verification</h1>{settings.certificateVerificationEnabled ? <><p>Verify an Innovix certificate using its unique verification ID.</p><form className="verification-search" onSubmit={event => { event.preventDefault(); navigate(`/verify/${encodeURIComponent(query.trim().toUpperCase())}`) }}><label>Certificate ID<input value={query} required maxLength={60} onChange={event => setQuery(event.target.value)} placeholder="INX-INT-2026-…" /></label><button className="button button-dark">Verify Certificate</button></form>{certificateId && state.id !== certificateId && <p role="status">Checking certificate...</p>}{certificateId && state.id === certificateId && state.error && <p className="learning-feedback" role="alert">{state.error}</p>}{certificateId && state.id === certificateId && state.data && <CertificateVerificationCard item={state.data} />}</> : <p>Certificate verification is currently unavailable.</p>}</section>
}
export function CertificateVerificationCard({ item }) {
  return <article className="certificate-verification"><span className="eyebrow">Innovix Projects · Official record</span><h2>{item.status === 'Revoked' ? 'Certificate Revoked' : 'VERIFIED CERTIFICATE'}</h2><dl className="learning-details">{[['Student Name', item.studentName], ['Certificate Type', item.type], ['Internship Domain', item.domain], ['Batch', item.batchName], ['Duration', item.duration], ['Issue Date', dateLabel(item.issueDate)], ['Certificate ID', item.certificateId], ['Verification Status', item.status]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Verification link / QR destination:</p><Link className="text-link" to={`/verify/${item.certificateId}`}>/verify/{item.certificateId}</Link></article>
}
