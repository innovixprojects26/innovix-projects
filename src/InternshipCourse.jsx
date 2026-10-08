import { Link, useParams } from 'react-router-dom'
import { useStudentSession } from './student-session-context'
import { useLearning } from './learning-api'
import { useSite } from './site-context'
import { sameInternshipDomain } from '../shared/internship-domain'

export function InternshipFee({ price = 499, premium = false }) {
  if (premium) {
    const saving = 799 - price
    return <div className="internship-fee internship-fee-premium"><p><del>₹799</del> <strong>₹{price.toLocaleString('en-IN')}</strong> <span>joining fee</span></p>{saving > 0 && <span className="premium-track-saving">Save ₹{saving.toLocaleString('en-IN')}</span>}</div>
  }
  return <p className="internship-fee"><strong>₹{price.toLocaleString('en-IN')}</strong> <span>joining fee</span></p>
}

export function PaymentSection({ payment }) {
  return <section className="learning-card" aria-label="Internship payment"><h3>Payment</h3><p>Course fee: <strong>₹{payment.fee.toLocaleString('en-IN')}</strong></p>{payment.status ? <p>Payment status: <strong>{payment.status}</strong></p> : <p>Sign in to view your payment status in the student dashboard.</p>}<p>Razorpay is OFF. No payment is required while the gateway is disabled. Admin-approved learning access remains available.</p>{payment.featureEnabled && <p>Payment feature is enabled in Admin; gateway activation is still pending.</p>}</section>
}

export function InternshipDetail() {
  const { domain } = useParams(), { domains, settings, loading, error } = useSite()
  const track = domains.find(item => sameInternshipDomain(item.name, domain))
  const { student } = useStudentSession()
  const progress = useLearning(student && sameInternshipDomain(student.internshipDomain, domain) ? '/progress' : null)
  if (loading) return <section className="section container">Loading internship...</section>
  if (!track || !settings.internshipsEnabled) return <section className="section container">{error || 'Internship unavailable.'}</section>
  const premium = track.name === 'AI Tools'
  return <section className={`section container learning-page${premium ? ' premium-internship-detail' : ''}`}><Link className="back-link" to="/internships">← Internships</Link>{premium && <span className="premium-track-badge">Premium AI Tools</span>}<h1>{track.name}</h1><InternshipFee price={track.price ?? 499} premium={premium} /><p>{track.description || 'Learn through recorded lessons, reviewed tasks and a final project, with mentor guidance.'}</p><h2>Videos → Tasks → Projects → Certificate</h2><p>Complete required lessons to unlock tasks. Admin-approved tasks unlock your final project. Upload your project for review before certificate eligibility. Certificates are issued by Admin.</p><PaymentSection payment={{ fee: track.price ?? 499, featureEnabled: settings.internshipPaymentsEnabled, ...progress.data?.payment }} /><Link className="button button-outline" to="/student/internship">View my progress and payment status</Link>{track.meetingUrl && <a className="button button-dark" href={track.meetingUrl} target="_blank" rel="noopener noreferrer">Join Live Class</a>}{settings.internshipApplicationsEnabled && track.applicationsOpen && <Link className="text-link" to="/internships#internship-application">Apply for internship</Link>}</section>
}
