import { internshipDisplayName } from './approved-internships.js'
import InternshipTestCheckout from './InternshipTestCheckout'
import InternshipLiveCheckout from './InternshipLiveCheckout'
import { InternshipPaymentAvailability } from './InternshipPaymentAvailability'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useStudentSession } from './student-session-context'

import { useSite } from './site-context'
import { sameInternshipDomain } from '../shared/internship-domain'

export function InternshipFee({ price = 499, premium = false }) {
  if (premium) {
    const saving = 799 - price
    return <div className="internship-fee internship-fee-premium"><p><del>₹799</del> <strong>₹{price.toLocaleString('en-IN')}</strong> <span>joining fee</span></p>{saving > 0 && <span className="premium-track-saving">Save ₹{saving.toLocaleString('en-IN')}</span>}</div>
  }
  return <p className="internship-fee"><strong>₹{price.toLocaleString('en-IN')}</strong> <span>joining fee</span></p>
}

export function PaymentSection({ payment, domain }) {
  const { student } = useStudentSession() || {}
  const location = useLocation()
  return <section className="learning-card" aria-label="Internship payment"><h3>Payment</h3><p>Course fee: <strong>₹{payment.fee.toLocaleString('en-IN')}</strong></p>{payment.status ? <p>Payment status: <strong>{payment.status}</strong></p> : <p>{student ? 'Your payment status is available in the student dashboard.' : 'Sign in to view your payment status in the student dashboard.'}</p>}<p>Learning access is granted only after the server verifies your payment.</p>{student ? <><InternshipPaymentAvailability /><InternshipLiveCheckout domain={domain} /><InternshipTestCheckout domain={domain} /></> : <Link className="button button-dark" to="/login" state={{ returnTo: location.pathname + location.search + location.hash }}>Sign in to continue</Link>}</section>
}

export function InternshipDetail() {
  const { domain } = useParams(), { domains, settings, loading, error } = useSite()
  const track = domains.find(item => sameInternshipDomain(item.name, domain))

  if (loading) return <section className="section container">Loading internship...</section>
  if (!track || track.name === 'AI Tools' || !settings.internshipsEnabled) return <section className="section container">{error || 'Internship unavailable.'}</section>
  const premium = track.name === 'AI Tools'
  return <section className={`section container learning-page${premium ? ' premium-internship-detail' : ''}`}><Link className="back-link" to="/internships">â† Internships</Link>{premium && <span className="premium-track-badge">Premium AI Tools</span>}<h1>{internshipDisplayName(track.name)}</h1><InternshipFee price={track.price ?? 499} premium={premium} /><p>{track.description || 'Learn through recorded lessons, reviewed tasks and a final project, with mentor guidance.'}</p><h2>Videos → Tasks → Projects → Certificate</h2><p>Complete required lessons to unlock tasks. Admin-approved tasks unlock your final project. Upload your project for review before certificate eligibility. Certificates are issued by Admin.</p><PaymentSection domain={track.name} payment={{ fee: track.price ?? 499, featureEnabled: settings.internshipPaymentsEnabled }} /><Link className="button button-outline" to="/student/internship">View my progress and payment status</Link>{track.liveClassEnabled && <Link className="button button-dark" to={`/internships/${encodeURIComponent(track.name)}?next=live#internship-payment`}>Join Live Class</Link>}{settings.internshipApplicationsEnabled && track.applicationsOpen && <Link className="text-link" to="/internships#internship-application">Apply for internship</Link>}</section>
}
