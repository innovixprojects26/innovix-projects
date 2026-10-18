import { useEffect, useRef, useState } from 'react'
import { studentFetch } from './student-api'
import { useStudentSession } from './student-session-context'

let checkoutLoader

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve()
  if (!checkoutLoader) {
    checkoutLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => window.Razorpay ? resolve() : reject(new Error('Razorpay Checkout unavailable'))
      script.onerror = () => reject(new Error('Could not load Razorpay Checkout'))
      document.head.appendChild(script)
    }).catch(error => {
      checkoutLoader = null
      throw error
    })
  }
  return checkoutLoader
}

export default function InternshipLiveCheckout({ domain }) {
  const { student, csrfToken } = useStudentSession() || {}
  const [availability, setAvailability] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasExistingOrder, setHasExistingOrder] = useState(false)
  const [recoveryChecked, setRecoveryChecked] = useState(false)
  const locked = useRef(false)
  const storageKey = `innovix-live-verification:${student?.studentId || student?._id}:${domain}`
  const [pending, setPending] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    } catch {
      return null
    }
  })

  useEffect(() => {
    let active = true
    studentFetch('/student/learning/payments/live/status')
      .then(data => { if (active) setAvailability(data) })
      .catch(() => { if (active) setMessage('Live payment status unavailable.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!student || !domain) {
      return () => { active = false }
    }

    studentFetch(
      `/student/learning/payments/live/recovery-status?domain=${encodeURIComponent(domain)}`
    )
      .then(result => {
        if (!active) return
        setHasExistingOrder(Boolean(result.hasOrder))
        setRecoveryChecked(true)
      })
      .catch(() => {
        if (!active) return
        setHasExistingOrder(true)
        setRecoveryChecked(true)
        setMessage('Payment status unavailable. Do not pay again until status is confirmed.')
      })

    return () => { active = false }
  }, [student, domain])
  const post = (path, body) => studentFetch(
    `/student/learning/payments/live/${path}`,
    {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    }
  )

  const verify = async details => {
    const result = await post('verify', details)
    if (result.status !== 'Paid' || result.mode !== 'live') {
      throw new Error('Payment not yet verified.')
    }
    sessionStorage.removeItem(storageKey)
    setPending(null)
    setMessage('Payment verified! Refresh your student dashboard to access learning.')
    window.dispatchEvent(new Event('innovix-learning-change'))
  }

  const retryVerification = async () => {
    if (!pending || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      setMessage('Retrying server verification...')
      await verify(pending)
    } catch (error) {
      setMessage(`${error.message} Do not pay again. Contact support if verification continues to fail.`)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const checkPaymentStatus = async () => {
    if (locked.current) return

    locked.current = true
    setBusy(true)
    setMessage('Checking your Razorpay payment with the server...')

    try {
      const result = await post('recover', { domain })

      if (result.status === 'Paid') {
        sessionStorage.removeItem(storageKey)
        setPending(null)
        setHasExistingOrder(true)
        setMessage('Payment verified! Refresh your student dashboard to access learning.')
        window.dispatchEvent(new Event('innovix-learning-change'))
      } else {
        setHasExistingOrder(true)
        setMessage(result.message || 'Payment is pending review. Do not pay again.')
      }
    } catch (error) {
      setMessage(`${error.message} Do not pay again until payment status is confirmed.`)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const pay = async () => {
    if (locked.current || pending || hasExistingOrder || !recoveryChecked || !availability?.available) return
    locked.current = true
    setBusy(true)
    setMessage('Creating secure Razorpay LIVE order...')

    const release = () => {
      locked.current = false
      setBusy(false)
    }

    try {
      await loadRazorpay()
      const order = await post('order', { domain })

      if (!order.key?.startsWith('rzp_live_') || !order.orderId || !order.amount || order.currency !== 'INR') {
        throw new Error('Invalid LIVE order response.')
      }

      const checkout = new window.Razorpay({
        key: order.key,
        order_id: order.orderId,
        amount: order.amount,
        currency: 'INR',
        name: 'Innovix Projects',
        description: `${order.domain} Internship`,
        prefill: {
          name: student?.fullName || '',
          email: student?.email || ''
        },
        handler: async details => {
          setPending(details)
          sessionStorage.setItem(storageKey, JSON.stringify(details))
          try {
            setMessage('Verifying captured payment with server...')
            await verify(details)
          } catch (error) {
            setMessage(`${error.message} If money was deducted, contact support. Do not pay again.`)
          } finally {
            release()
          }
        },
        modal: {
          ondismiss: () => {
            setMessage('Checkout closed. Check payment status before retrying.')
            release()
          }
        }
      })

      checkout.on('payment.failed', () => {
        setMessage('Payment failed. Check Razorpay status before retrying.')
        release()
      })

      checkout.open()
    } catch (error) {
      setMessage(error.message)
      release()
    }
  }

  if (!student) return null

  return (
    <div aria-label="Razorpay live checkout">
      {pending ? (
        <button className="button button-dark" type="button" disabled={busy} onClick={retryVerification}>
          {busy ? 'Verifying...' : 'Retry Payment Verification'}
        </button>
      ) : availability?.available && recoveryChecked && !hasExistingOrder ? (
        <button className="button button-dark" type="button" disabled={busy} onClick={pay}>
          {busy ? 'Processing...' : 'Pay Securely with Razorpay'}
        </button>
      ) : null}
      <button
        className="button button-dark"
        type="button"
        disabled={busy}
        onClick={checkPaymentStatus}
      >
        {busy ? 'Checking...' : 'Check Payment Status'}
      </button>
      <p role="status">{message || availability?.message || 'Checking live payment availability...'}</p>
    </div>
  )
}
