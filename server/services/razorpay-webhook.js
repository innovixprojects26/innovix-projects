import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyRazorpayWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (
    !secret ||
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest()

  const received = Buffer.from(signature, 'hex')

  return timingSafeEqual(expected, received)
}
