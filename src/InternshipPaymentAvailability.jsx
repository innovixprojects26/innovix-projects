import { useEffect, useState } from 'react'
import { studentFetch } from './student-api'

export function PaymentAvailabilityMessage({ availability, error = '' }) {
  return <div id="internship-payment" role="status" aria-live="polite">{error || availability?.message || 'Checking online payment availability...'}</div>
}

export function InternshipPaymentAvailability() {
  const [availability, setAvailability] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    studentFetch('/student/learning/payments/live/status')
      .then(value => { if (active) setAvailability(value) })
      .catch(() => { if (active) setError('Payment availability could not be checked. Please refresh or contact support before paying.') })
    return () => { active = false }
  }, [])
  return <PaymentAvailabilityMessage availability={availability} error={error} />
}
