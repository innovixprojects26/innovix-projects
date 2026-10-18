import { createHmac, timingSafeEqual } from 'node:crypto'

const problem = (message, status = 400) =>
  Object.assign(new Error(message), { status })

export function liveCredentials() {
  const key = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET

  if (!key?.startsWith('rzp_live_') || !secret) {
    throw problem('Razorpay LIVE credentials are unavailable.', 503)
  }

  return { key, secret }
}

export function verifyLiveSignature(orderId, paymentId, signature) {
  if (
    typeof orderId !== 'string' ||
    !/^order_[a-zA-Z0-9]+$/.test(orderId) ||
    typeof paymentId !== 'string' ||
    !/^pay_[a-zA-Z0-9]+$/.test(paymentId) ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) return false

  const { secret } = liveCredentials()
  const expected = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest()

  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}

export async function liveRazorpay(path, body) {
  const { key, secret } = liveCredentials()

  let response
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000)
    })
  } catch {
    throw problem('Razorpay LIVE service is unavailable.', 502)
  }

  if (!response.ok) {
    throw problem('Razorpay LIVE request failed.', 502)
  }

  return response.json()
}

export async function verifiedLivePayment(payment, details) {
  if (
    !payment?.orderId ||
    details?.razorpay_order_id !== payment.orderId ||
    !verifyLiveSignature(
      payment.orderId,
      details?.razorpay_payment_id,
      details?.razorpay_signature
    )
  ) {
    throw problem('LIVE payment signature verification failed.', 400)
  }

  const remote = await liveRazorpay(
    `payments/${details.razorpay_payment_id}`
  )

  if (
    remote.id !== details.razorpay_payment_id ||
    remote.order_id !== payment.orderId ||
    remote.amount !== payment.amount ||
    remote.currency !== 'INR' ||
    remote.status !== 'captured' ||
    remote.captured !== true ||
    remote.amount_refunded > 0
  ) {
    throw problem('LIVE payment is not captured or does not match the order.', 409)
  }

  return remote.id
}

// Activation remains an explicit server-side operational decision.
export function livePaymentAvailability(paymentsEnabled) {
  const configured = Boolean(process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET)
  const available = Boolean(paymentsEnabled && configured && process.env.RAZORPAY_LIVE_ENABLED === 'true')
  return { mode: 'live', available, status: available ? 'ready' : 'blocked',
    message: available ? 'Online payment verification is configured.' : 'Online internship payments are not activated. Please contact support before paying.' }
}
export function requireLiveActivation() {
  if (process.env.RAZORPAY_LIVE_ENABLED !== 'true' || !process.env.RAZORPAY_WEBHOOK_SECRET) throw problem('LIVE payments are not activated.', 503)
  liveCredentials()
}
