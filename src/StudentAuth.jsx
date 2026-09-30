import { useId, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { PhoneField } from './PhoneField'
import { useStudentSession } from './student-session-context'
import { safeStudentReturnTo, studentFetch } from './student-api'
import { passwordError, passwordHint, studentDomains, studyYears } from '../shared/student'
import { normalizePhone } from '../shared/phone'
import { assessStudentPassword, passwordMinLength, passwordMaxLength } from '../shared/student-password'

function PasswordField({ label = 'Password', name = 'password', newPassword = false, value, onChange, describedBy }) {
  const [shown, setShown] = useState(false)
  const id = useId()
  return <label className="student-field" htmlFor={id}><span>{label}</span><div className="student-password"><input id={id} name={name} type={shown ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} required minLength={newPassword ? passwordMinLength : undefined} maxLength={passwordMaxLength} value={value} onChange={onChange} aria-describedby={describedBy} /><button type="button" aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={shown} onClick={() => setShown((value) => !value)}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
}
export function StudentPasswordStrength({ password, id }) {
  const { requirements, strength } = assessStudentPassword(password)
  return <div className="student-password-feedback" id={id}><p className={`student-strength student-strength-${strength.toLowerCase()}`} role="status" aria-live="polite">Password strength: <strong>{strength}</strong></p><p>Password must:</p><ul>{requirements.map(({ id: key, label, met }) => <li key={key} data-met={met}><span aria-hidden="true">{met ? '✓' : '○'}</span><span className="student-sr-only">{met ? 'Met: ' : 'Not met: '}</span>{label}</li>)}</ul></div>
}
function NewPasswordFields({ passwords, onChange }) {
  const feedbackId = useId()
  const mismatchId = useId()
  const mismatch = Boolean(passwords.confirmation) && passwords.password !== passwords.confirmation
  return <div className="student-form-wide student-new-passwords"><div><PasswordField newPassword value={passwords.password} onChange={(event) => onChange({ ...passwords, password: event.target.value })} describedBy={feedbackId} /><StudentPasswordStrength password={passwords.password} id={feedbackId} /></div><div><PasswordField label="Confirm Password" name="confirmPassword" newPassword value={passwords.confirmation} onChange={(event) => onChange({ ...passwords, confirmation: event.target.value })} describedBy={mismatch ? mismatchId : undefined} />{mismatch && <p id={mismatchId} className="student-error" role="status">Passwords do not match.</p>}</div></div>
}
function AuthFrame({ title, eyebrow, subtitle, children }) {
  return <section className="student-auth-page"><div className="student-auth-intro"><span className="eyebrow">Innovix Projects</span><h1>Learn. Build.<br />Grow together.</h1><p>Your next step starts with the skills you practice today.</p><div><ShieldCheck size={20} /><span>Your student learning space</span></div></div><div className="student-auth-panel"><Link className="back-link" to="/">← Back home</Link><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{subtitle}</p>{children}</div></section>
}
function Feedback({ error, notice }) { return <>{error && <p className="student-error" role="alert">{error}</p>}{notice && <p className="student-notice" role="status">{notice}</p>}</> }

export function StudentLogin() {
  const session = useStudentSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const returnTo = safeStudentReturnTo(location.state?.returnTo)
  if (session.student) return <Navigate to={returnTo} replace />
  const submit = async (event) => {
    event.preventDefault(); if (busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true); setError('')
    try { await session.login({ email: values.email, password: values.password, rememberMe: values.rememberMe === 'on' }); navigate(returnTo, { replace: true }) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <AuthFrame eyebrow="Student Login" title="Welcome Back" subtitle="Login to continue your learning journey with Innovix Projects."><Feedback error={error} notice={location.state?.notice} /><form className="student-auth-form" onSubmit={submit}><label className="student-field">Email Address<input name="email" type="email" autoComplete="username" required maxLength="254" defaultValue={location.state?.email || ''} /></label><PasswordField /><div className="student-auth-options"><label><input type="checkbox" name="rememberMe" /> Remember Me</label><Link to="/forgot-password">Forgot Password?</Link></div><button className="button button-dark" disabled={busy || session.loading}>{busy ? 'Logging in...' : 'Login'} <ArrowRight size={16} /></button></form><p className="student-auth-switch">New to Innovix Projects? <Link to="/register" state={{ returnTo }}>Create Account →</Link></p></AuthFrame>
}

export function StudentRegistration() {
  const { student } = useStudentSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [passwords, setPasswords] = useState({ password: '', confirmation: '' })
  const returnTo = safeStudentReturnTo(location.state?.returnTo)
  if (student) return <Navigate to="/student" replace />
  const submit = async (event) => {
    event.preventDefault(); if (busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const validation = passwordError(values.password, values.confirmPassword)
    if (validation) { setError(validation); return }
    try { normalizePhone(values.phoneCountry, values.phone, true) } catch (err) { setError(err.message); return }
    setBusy(true); setError('')
    try {
      await studentFetch('/student/register', { method: 'POST', body: JSON.stringify(values) })
      navigate('/login', { replace: true, state: { returnTo, email: values.email, notice: 'Account created. Log in to start learning.' } })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <AuthFrame eyebrow="Student Registration" title="Create your account" subtitle="Join the Innovix Projects student learning community."><Feedback error={error} /><form className="student-auth-form student-registration" onSubmit={submit}><div className="student-form-grid"><label className="student-field">Full Name<input name="fullName" autoComplete="name" required maxLength="120" /></label><label className="student-field">Email Address<input name="email" type="email" autoComplete="email" required maxLength="254" /></label><div className="student-form-wide"><PhoneField required /></div><label className="student-field">College / Institution<input name="college" autoComplete="organization" required maxLength="180" /></label><label className="student-field">Department / Course<input name="course" required maxLength="120" /></label><label className="student-field">Year of Study<select name="yearOfStudy" required defaultValue=""><option value="" disabled>Select year</option>{studyYears.map((year) => <option key={year}>{year}</option>)}</select></label><label className="student-field">Internship Domain<select name="internshipDomain" required defaultValue=""><option value="" disabled>Select domain</option>{studentDomains.map((domain) => <option key={domain}>{domain}</option>)}</select></label><NewPasswordFields passwords={passwords} onChange={setPasswords} /></div><p className="student-password-hint">{passwordHint}</p><button className="button button-dark" disabled={busy || Boolean(passwordError(passwords.password, passwords.confirmation))}>{busy ? 'Creating account...' : 'Create Account'} <ArrowRight size={16} /></button></form><p className="student-auth-switch">Already have an account? <Link to="/login" state={{ returnTo }}>Login →</Link></p></AuthFrame>
}

export function StudentForgotPassword() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const submit = async (event) => {
    event.preventDefault(); if (busy) return
    const email = new FormData(event.currentTarget).get('email')
    setBusy(true); setError(''); setNotice('')
    try { const data = await studentFetch('/student/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }); setNotice(data.message) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <AuthFrame eyebrow="Student account" title="Forgot Password?" subtitle="Enter your account email to request a password reset link."><Feedback error={error} notice={notice} /><form className="student-auth-form" onSubmit={submit}><label className="student-field">Email Address<input name="email" type="email" autoComplete="email" required maxLength="254" /></label><button className="button button-dark" disabled={busy}>{busy ? 'Requesting...' : 'Request reset link'}</button></form><p className="student-auth-switch"><Link to="/login">Back to Login</Link> · <Link to="/contact">Contact support</Link></p></AuthFrame>
}

export function StudentResetPassword() {
  const location = useLocation()
  const navigate = useNavigate()
  const { refresh } = useStudentSession()
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || ''
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwords, setPasswords] = useState({ password: '', confirmation: '' })
  const validToken = /^[a-f0-9]{64}$/.test(token)
  const submit = async (event) => {
    event.preventDefault(); if (busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const validation = passwordError(values.password, values.confirmPassword)
    if (validation) { setError(validation); return }
    setBusy(true); setError('')
    try {
      const data = await studentFetch('/student/reset-password', { method: 'POST', body: JSON.stringify({ ...values, token }) })
      await refresh()
      navigate('/login', { replace: true, state: { notice: data.message } })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <AuthFrame eyebrow="Student account" title="Set a new password" subtitle="Choose a strong password for your Innovix account."><Feedback error={error || (!validToken ? 'Open the complete reset link from your email, or request a new one.' : '')} />{validToken && <form className="student-auth-form" onSubmit={submit}><NewPasswordFields passwords={passwords} onChange={setPasswords} /><p className="student-password-hint">{passwordHint}</p><button className="button button-dark" disabled={busy || Boolean(passwordError(passwords.password, passwords.confirmation))}>{busy ? 'Updating...' : 'Update Password'}</button></form>}<p className="student-auth-switch"><Link to="/forgot-password">Request a new reset link</Link></p></AuthFrame>
}
