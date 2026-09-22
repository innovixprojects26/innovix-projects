import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormField, Toast } from './components'
import { PhoneField } from './PhoneField'
import { submitPublic } from './api'
import { normalizePhone } from '../shared/phone'

export function ContactForm() {
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
    if (['name', 'email', 'subject', 'message'].some((key) => !String(values[key] || '').trim())) { setError('Enter your name, email, subject, and message.'); return }
    let phone
    try { phone = normalizePhone(values.phoneCountry, values.phone) }
    catch (phoneError) { setError(phoneError.message); fields.current.phone?.focus(); return }
    setSending(true)
    setError('')
    try {
      await submitPublic('/contact', { ...values, ...phone })
      formRef.current?.reset()
      setSent(true)
    } catch (requestError) {
      setError(requestError.message || 'Your message could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }
  return <form ref={formRef} className="form-card" onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') event.preventDefault() }}>
    <h2>Send an enquiry</h2><p>We usually respond within one working day.</p>
    <div className="form-two"><FormField label="Your name" name="name" required ref={field('name')} onKeyDown={(event) => focusNext(event, 'email')} /><FormField label="Email address" name="email" type="email" required ref={field('email')} onKeyDown={(event) => focusNext(event, 'country')} /></div>
    <div className="form-two"><PhoneField countryRef={field('country')} ref={field('phone')} onCountryKeyDown={(event) => focusNext(event, 'phone')} onPhoneKeyDown={(event) => focusNext(event, 'degreeCourse')} /><FormField label="Degree / Course" name="degreeCourse" ref={field('degreeCourse')} onKeyDown={(event) => focusNext(event, 'subject')} /></div>
    <FormField label="Subject" name="subject" required maxLength="160" ref={field('subject')} onKeyDown={(event) => focusNext(event, 'message')} />
    <FormField label="How can we help?" name="message" as="textarea" rows="5" required ref={field('message')} />
    <button className="button button-dark" type="submit" disabled={sending || sent}>{sending ? 'Sending...' : sent ? 'Message sent' : 'Send message'} <ArrowRight size={16} /></button>
    {sent && <Toast>Thank you! Your message has been received.</Toast>}
    {error && <div className="catalog-error" role="alert">{error}</div>}
  </form>
}
