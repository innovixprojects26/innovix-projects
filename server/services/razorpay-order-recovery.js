import { liveRazorpay } from './razorpay-live.js'

const review = () => Object.assign(
  new Error('Payment needs administrator review before another attempt.'),
  { status: 409 }
)

export async function findCapturedOrderPayment(orderId, expectedAmount, enrollmentId) {
  if (
    typeof orderId !== 'string' ||
    !/^order_[a-zA-Z0-9]+$/.test(orderId) ||
    !Number.isSafeInteger(expectedAmount) ||
    expectedAmount < 100
  ) throw review()

  const order = await liveRazorpay(`orders/${orderId}`)

  if (
    order?.id !== orderId ||
    order.amount !== expectedAmount ||
    order.currency !== 'INR' ||
    order.receipt !== `il_${enrollmentId}` ||
    order.notes?.purpose !== 'internship_live' ||
    order.notes?.enrollment !== String(enrollmentId)
  ) throw review()

  const result = await liveRazorpay(
    `orders/${orderId}/payments?count=100&skip=0`
  )

  if (
    !Array.isArray(result?.items) ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0 ||
    result.count > 100 ||
    result.items.length !== result.count
  ) throw review()

  const captured = []

  for (const payment of result.items) {
    if (
      !/^pay_[a-zA-Z0-9]+$/.test(payment?.id || '') ||
      payment.order_id !== orderId ||
      payment.currency !== 'INR' ||
      !Number.isSafeInteger(payment.amount) ||
      !Number.isSafeInteger(payment.amount_refunded) ||
      payment.amount_refunded < 0 ||
      payment.amount_refunded > payment.amount
    ) throw review()

    if (
      payment.status === 'captured' ||
      payment.status === 'refunded' ||
      payment.captured === true ||
      payment.amount_refunded > 0
    ) {
      if (payment.amount !== expectedAmount) throw review()
      captured.push(payment)
    } else if (!['failed', 'authorized', 'created'].includes(payment.status)) {
      throw review()
    }
  }

  if (captured.length > 1) throw review()

  if (captured.length === 1) {
    return {
      status: 'Found',
      paymentId: captured[0].id
    }
  }

  return {
    status: 'Pending',
    paymentId: null
  }
}
