
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { studentFetch } from './student-api'
import { useStudentSession } from './student-session-context'
import { sameInternshipDomain } from '../shared/internship-domain'

let scriptPromise

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')

      const failed = () => {
        clearTimeout(timer)
        script.remove()
        scriptPromise = null
        reject(
          new Error(
            'Checkout could not load. Retry when your connection is available.'
          )
        )
      }

      const timer = setTimeout(failed, 15000)

      script.src = 'https://checkout.razorpay.com/v1/checkout.js'

      script.onload = () => {
        clearTimeout(timer)

        if (!window.Razorpay) {
          failed()
          return
        }

        resolve()
      }

      script.onerror = failed
      document.head.appendChild(script)
    })
  }

  return scriptPromise
}

function requestedDestination(search) {
  const next = new URLSearchParams(search).get('next')

  // Allow only known internal destinations.
  if (next === 'recorded') return 'recorded'
  if (next === 'live') return 'live'

  return 'dashboard'
}

export default function InternshipTestCheckout({ domain }) {
  const session = useStudentSession() || {}

  return (
    <Checkout
      key={`${session.student?.studentId || session.student?._id}:${domain || ''}`}
      session={session}
      domain={domain}
    />
  )
}

function Checkout({ session, domain }) {
  const { student, csrfToken } = session
  const navigate = useNavigate()
  const location = useLocation()

  const [quote, setQuote] = useState(null)
  const [message, setMessage] = useState('Loading test payment...')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [pending, setPending] = useState(null)

  const locked = useRef(false)
  const completed = useRef(false)

  const local =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(
      window.location.hostname
    )

  const eligible =
    import.meta.env.DEV &&
    local &&
    new URLSearchParams(location.search).get('paymentMode') === 'test' &&
    student &&
    !sameInternshipDomain(student.internshipDomain, 'AI Tools') &&
    (!domain ||
      sameInternshipDomain(
        domain,
        student.internshipDomain
      ))

  const storageKey =
    `innovix-test-payment:${student?.studentId || student?._id}`

  const destination = requestedDestination(location.search)

  const post = (path, body) =>
    studentFetch(
      `/student/learning/payments/test/${path}`,
      {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      }
    )

  const openUnlockedDestination = useCallback(async () => {
    const dashboard = await studentFetch('/student/dashboard')

    // Payment verification alone is not enough.
    // Backend must explicitly confirm learning access.
    if (
      dashboard?.paymentVerified !== true ||
      dashboard?.hasDomainAccess !== true
    ) {
      setMessage(
        'Test payment verified, but learning access is not yet available. Check your batch enrollment or contact Admin.'
      )
      return
    }

    completed.current = true

    window.dispatchEvent(
      new Event('innovix-learning-change')
    )

    if (destination === 'recorded' && !dashboard.recordedClassesAvailable) {
      setMessage('Test payment verified. Recorded classes are not currently enabled for your domain.')
      return
    }
    if (destination === 'recorded') {
      navigate('/student/recorded-classes', {
        replace: true
      })
      return
    }

    if (destination === 'live') {
      // Navigate to the protected student dashboard first.
      // The actual meeting link is supplied by the backend
      // only when the live class is enabled and available.
      navigate('/student/internship', {
        replace: true
      })
      return
    }

    navigate('/student', {
      replace: true
    })
  }, [destination, navigate])

  useEffect(() => {
    if (!eligible) return

    let active = true

    studentFetch('/student/learning/enroll', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ domain: domain || student.internshipDomain }) })
      .then(async data => {
        if (!active) return

        setQuote(data)
        setMessage('')

        if (data.status === 'Paid') {
          setMessage(
            location.pathname.startsWith('/internships/') ? 'Test payment already verified. Checking your learning access...' : 'TEST payment verified.'
          )

          try {
            if (location.pathname.startsWith('/internships/')) await openUnlockedDestination()
          } catch (error) {
            if (active) {
              setMessage(
                `Payment verified. Could not check learning access: ${error.message}`
              )
            }
          }

          return
        }

        try {
          const saved = JSON.parse(
            sessionStorage.getItem(storageKey)
          )

          if (
            saved?.razorpay_order_id === data.orderId
          ) {
            setPending(saved)
            setMessage(
              'A payment is awaiting server verification. Retry verification below.'
            )
          }
        } catch {
          // Session storage is optional.
        }
      })
      .catch(error => {
        if (active) setMessage(error.message)
      })

    return () => {
      active = false
    }
  }, [eligible, storageKey, retry, csrfToken, domain, student?.internshipDomain, location.pathname, openUnlockedDestination])

  if (sameInternshipDomain(domain || student?.internshipDomain, 'AI Tools')) return <p>AI Tools learning and payments are currently unavailable.</p>
  if (!eligible) return null

  const verify = async details => {
    setPending(details)

    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify(details)
      )
    } catch {
      // In-page retry still works.
    }

    setMessage('Verifying payment with the server...')

    const result = await post('verify', details)

    if (
      result?.status !== 'Paid' ||
      result?.mode !== 'test'
    ) {
      throw new Error(
        'Server has not confirmed the test payment.'
      )
    }

    setPending(null)

    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // Optional recovery storage.
    }

    setQuote(value => ({
      ...value,
      status: 'Paid'
    }))

    setMessage(
      'Test payment verified. Checking available learning content...'
    )

    try {
      await openUnlockedDestination()
    } catch (error) {
      setMessage(
        `Payment verified, but dashboard access could not be checked: ${error.message}`
      )
    }
  }

  const pay = async () => {
    if (locked.current || completed.current) return

    locked.current = true
    setBusy(true)
    setMessage('Preparing test checkout...')

    const release = () => {
      locked.current = false
      setBusy(false)
    }

    try {
      if (pending) {
        await verify(pending)
        release()
        return
      }

      await loadCheckout()

      const order = await post('order', {})

      setQuote(order)

      if (order.status === 'Paid') {
        setMessage(
          'Payment already verified. Checking access...'
        )

        await openUnlockedDestination()
        release()
        return
      }

      if (
        !order.key ||
        !order.orderId ||
        !order.amount
      ) {
        throw new Error(
          'Incomplete Razorpay test order response.'
        )
      }

      let handled = false

      const checkout = new window.Razorpay({
        key: order.key,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Innovix Projects',
        description: `${order.domain} Internship - TEST`,
        prefill: {
          name: student.fullName,
          email: student.email
        },
        retry: {
          enabled: false
        },
        handler: async details => {
          handled = true

          try {
            await verify(details)
          } catch (error) {
            setMessage(
              `${error.message} Payment is not confirmed. Retry verification.`
            )
          } finally {
            release()
          }
        },
        modal: {
          ondismiss: () => {
            if (!handled) {
              setMessage(
                'Payment cancelled. You can retry the same test order.'
              )
              release()
            }
          }
        }
      })

      checkout.on('payment.failed', () => {
        handled = true
        checkout.close()

        setMessage(
          'Test payment failed. Retry the same order below.'
        )

        release()
      })

      setMessage(
        'Complete the payment in Razorpay Test Checkout.'
      )

      checkout.open()
    } catch (error) {
      setMessage(error.message)
      release()
    }
  }

  const retryStatus = () => {
    if (locked.current) return

    setQuote(null)
    setPending(null)
    setMessage('Loading test payment...')
    setRetry(value => value + 1)
  }

  return (
    <div
      id="internship-payment"
      aria-label="Razorpay test checkout"
    >
      <p>
        <strong>
          TEST MODE — no real charge.
          This checkout uses test payments only.
        </strong>
      </p>

      {quote?.batchCode && <p>Enrollment: <strong>{quote.batchCode}</strong> ? {quote.paymentStatus}</p>}

      {quote?.status === 'Paid' ? (
        <>
          <p>
            Test payment successful — server verified.
          </p>

          <button
            type="button"
            className="button button-dark"
            onClick={() => openUnlockedDestination().catch(error => setMessage(error.message))}
          >
            {destination === 'recorded' ? 'Open Recorded Classes' : destination === 'live' ? 'Open My Internship' : 'Open Student Dashboard'}
          </button>
        </>
      ) : quote?.alreadyPaid ? (
        <p>
          This enrollment already has a paid record.
        </p>
      ) : quote ? (
        <button
          type="button"
          className="button button-dark"
          disabled={busy}
          onClick={pay}
        >
          {busy
            ? 'Processing...'
            : pending
              ? 'Retry Verification'
              : `Pay ₹${Number(quote.fee).toLocaleString('en-IN')}`}
        </button>
      ) : (
        <button
          type="button"
          className="button button-outline"
          onClick={retryStatus}
        >
          Reload Payment Status
        </button>
      )}

      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  )
}
