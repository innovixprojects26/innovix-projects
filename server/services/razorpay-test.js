import { createHmac, timingSafeEqual } from 'node:crypto'

const problem = (message, status = 400) => Object.assign(new Error(message), { status })
export function testCredentials() {
  const key = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET
  if (!key?.startsWith('rzp_test_') || !secret || process.env.NODE_ENV === 'production') throw problem('Local Razorpay test checkout is unavailable. Test credentials are required; LIVE payments are disabled.', 503)
  return { key, secret }
}
export function paise(price) {
  const amount = Math.round(price * 100)
  if (typeof price !== 'number' || !Number.isFinite(price) || !Number.isSafeInteger(amount) || amount < 100 || amount > 100000000) throw problem('Admin must configure a valid internship fee of at least ₹1.')
  return amount
}
export async function razorpay(path, body) {
  const { key, secret } = testCredentials()
  let response
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) })
  } catch { throw problem('Razorpay could not be reached. The payment has not been confirmed.', 502) }
  // Never expose provider responses or credentials through errors/logs.
  if (!response.ok) throw problem('Razorpay rejected the request. Check test account configuration.', 502)
  return response.json()
}
export function validSignature(orderId, paymentId, signature) {
  const { secret } = testCredentials()
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) || typeof paymentId !== 'string' || !/^pay_[a-zA-Z0-9]+$/.test(paymentId)) return false
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest()
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
export async function verifiedPayment(payment, details) {
  if (details.razorpay_order_id !== payment.orderId || !validSignature(payment.orderId, details.razorpay_payment_id, details.razorpay_signature)) throw problem('Payment signature verification failed.')
  const remote = await razorpay(`payments/${details.razorpay_payment_id}`)
  if (remote.id !== details.razorpay_payment_id || remote.order_id !== payment.orderId || remote.amount !== payment.amount || remote.currency !== 'INR' || remote.status !== 'captured' || remote.captured !== true || remote.amount_refunded > 0) throw problem('Payment is not captured or does not match this order. Retry verification shortly.', 409)
  return remote.id
}
