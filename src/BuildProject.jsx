import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormField, Toast } from './components'
import { PhoneField } from './PhoneField'
import { submitPublic } from './api'
import { normalizePhone } from '../shared/phone'

export function BuildProject() {
  const fields = useRef({})
  const formRef = useRef(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const focusNext = (event, next) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      fields.current[next]?.focus()
    }
  }
  const field = (name) => (element) => { fields.current[name] = element }
  const submit = async (event) => {
    event.preventDefault()
    if (sending || sent) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const required = ['studentName', 'email', 'degreeCourse', 'college', 'domain', 'preferredTechnology', 'projectIdea', 'description', 'deadline']
    if (required.some((key) => !String(values[key] || '').trim())) { setError('Complete all required fields.'); return }
    let phone
    try { phone = normalizePhone(values.phoneCountry, values.phone, true) }
    catch (phoneError) { setError(phoneError.message); fields.current.phone?.focus(); return }
    if (values.budget && (!Number.isFinite(Number(values.budget)) || Number(values.budget) < 0)) { setError('Enter a valid budget or leave it blank.'); return }
    setSending(true)
    setError('')
    try {
      await submitPublic('/custom-projects', { ...values, ...phone })
      formRef.current?.reset()
      setSent(true)
    } catch (requestError) {
      setError(requestError.message || 'Your request could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }
  return <section className="section container build-page">
    <div className="page-intro"><span className="eyebrow">Build your own project</span><h1>Start with the idea<br /><em>you cannot stop thinking about.</em></h1><p>Share what you want to build. We will help you plan the scope and next step.</p></div>
    <form ref={formRef} className="form-card wide-form" onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') event.preventDefault() }}>
      <div className="form-two"><FormField label="Student name" name="studentName" required ref={field('studentName')} onKeyDown={(event) => focusNext(event, 'email')} /><FormField label="Email" name="email" type="email" required ref={field('email')} onKeyDown={(event) => focusNext(event, 'country')} /></div>
      <div className="form-two"><PhoneField required countryRef={field('country')} ref={field('phone')} onCountryKeyDown={(event) => focusNext(event, 'phone')} onPhoneKeyDown={(event) => focusNext(event, 'degreeCourse')} /><FormField label="Degree / Course" name="degreeCourse" required ref={field('degreeCourse')} onKeyDown={(event) => focusNext(event, 'college')} /></div>
      <div className="form-two"><FormField label="College" name="college" required ref={field('college')} onKeyDown={(event) => focusNext(event, 'domain')} /><FormField label="Project domain" name="domain" required ref={field('domain')} onKeyDown={(event) => focusNext(event, 'preferredTechnology')} /></div>
      <div className="form-two"><FormField label="Preferred technology" name="preferredTechnology" required ref={field('preferredTechnology')} onKeyDown={(event) => focusNext(event, 'projectIdea')} /><FormField label="Project title / idea" name="projectIdea" required ref={field('projectIdea')} onKeyDown={(event) => focusNext(event, 'deadline')} /></div>
      <div className="form-two"><FormField label="Expected completion date" name="deadline" type="date" required ref={field('deadline')} onKeyDown={(event) => focusNext(event, 'budget')} /><FormField label="Budget (optional, ₹)" name="budget" type="number" min="0" step="0.01" ref={field('budget')} onKeyDown={(event) => focusNext(event, 'description')} /></div>
      <FormField label="Detailed requirements" name="description" as="textarea" rows="5" required ref={field('description')} />
      <button className="button button-dark" type="submit" disabled={sending || sent}>{sending ? 'Sending...' : sent ? 'Request sent' : 'Send Request'} <ArrowRight size={16} /></button>
      {sent && <Toast>Your custom project request has been received.</Toast>}
      {error && <div className="catalog-error" role="alert">{error}</div>}
    </form>
  </section>
}
