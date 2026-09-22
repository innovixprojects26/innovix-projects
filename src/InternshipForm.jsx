import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormField, Toast } from './components'
import { PhoneField } from './PhoneField'
import { submitPublic } from './api'
import { normalizePhone } from '../shared/phone'
import { internshipRoles } from './data'

const roles = [...internshipRoles, 'Frontend Development', 'Python Development', 'UI/UX Design']
const levels = ['Beginner', 'Some experience', 'Intermediate', 'Advanced']

export function InternshipForm() {
  const fields = useRef({})
  const formRef = useRef(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const field = (name) => (element) => { fields.current[name] = element }
  const focusNext = (event, next) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      fields.current[next]?.focus()
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    if (sending || sent) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const required = ['name', 'email', 'degreeCourse', 'department', 'college', 'studyYear', 'domain', 'skills', 'experienceLevel', 'message']
    if (required.some((key) => !String(values[key] || '').trim())) { setError('Complete all required application fields.'); return }
    let phone
    try { phone = normalizePhone(values.phoneCountry, values.phone, true) }
    catch (phoneError) { setError(phoneError.message); fields.current.phone?.focus(); return }
    setSending(true)
    setError('')
    try {
      await submitPublic('/internships/apply', { ...values, ...phone })
      formRef.current?.reset()
      setSent(true)
    } catch (requestError) {
      setError(requestError.message || 'Your application could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }
  return <form ref={formRef} className="form-card internship-form" id="internship-application" onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') event.preventDefault() }}>
    <span className="eyebrow">Apply for internship</span><h2>Tell us about yourself and the work you want to explore.</h2>
    <div className="form-two"><FormField label="Full name" name="name" required ref={field('name')} onKeyDown={(event) => focusNext(event, 'email')} /><FormField label="Email" name="email" type="email" required ref={field('email')} onKeyDown={(event) => focusNext(event, 'country')} /></div>
    <div className="form-two"><PhoneField required countryRef={field('country')} ref={field('phone')} onCountryKeyDown={(event) => focusNext(event, 'phone')} onPhoneKeyDown={(event) => focusNext(event, 'degreeCourse')} /><FormField label="Degree / Course" name="degreeCourse" placeholder="B.Sc Agriculture, B.Com, Diploma..." required ref={field('degreeCourse')} onKeyDown={(event) => focusNext(event, 'department')} /></div>
    <div className="form-two"><FormField label="Department / Major" name="department" required ref={field('department')} onKeyDown={(event) => focusNext(event, 'college')} /><FormField label="College / University" name="college" required ref={field('college')} onKeyDown={(event) => focusNext(event, 'studyYear')} /></div>
    <div className="form-two"><FormField label="Current year / Graduation year" name="studyYear" placeholder="2nd year or graduating 2027" required ref={field('studyYear')} onKeyDown={(event) => focusNext(event, 'domain')} /><FormField label="Preferred internship role" name="domain" as="select" required defaultValue="" ref={field('domain')} onKeyDown={(event) => focusNext(event, 'skills')}><option value="" disabled>Select a role</option>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</FormField></div>
    <div className="form-two"><FormField label="Skills" name="skills" placeholder="Writing, research, Python, design..." required ref={field('skills')} onKeyDown={(event) => focusNext(event, 'experienceLevel')} /><FormField label="Experience level" name="experienceLevel" as="select" required defaultValue="" ref={field('experienceLevel')} onKeyDown={(event) => focusNext(event, 'portfolioUrl')}><option value="" disabled>Select your level</option>{levels.map((level) => <option key={level}>{level}</option>)}</FormField></div>
    <div className="form-two"><FormField label="Portfolio URL (optional)" name="portfolioUrl" type="url" ref={field('portfolioUrl')} onKeyDown={(event) => focusNext(event, 'githubUrl')} /><FormField label="GitHub URL (optional)" name="githubUrl" type="url" ref={field('githubUrl')} onKeyDown={(event) => focusNext(event, 'linkedinUrl')} /></div>
    <div className="form-two"><FormField label="LinkedIn URL (optional)" name="linkedinUrl" type="url" ref={field('linkedinUrl')} onKeyDown={(event) => focusNext(event, 'availabilityDate')} /><FormField label="Preferred start date (optional)" name="availabilityDate" type="date" ref={field('availabilityDate')} onKeyDown={(event) => focusNext(event, 'message')} /></div>
    <FormField label="Why do you want to join Innovix Projects?" name="message" as="textarea" rows="5" required ref={field('message')} />
    <button className="button button-dark" type="submit" disabled={sending || sent}>{sending ? 'Sending...' : sent ? 'Application sent' : 'Submit Application'} <ArrowRight size={16} /></button>
    {sent && <Toast>Thank you. Your internship application has been received.</Toast>}
    {error && <div className="catalog-error" role="alert">{error}</div>}
  </form>
}
