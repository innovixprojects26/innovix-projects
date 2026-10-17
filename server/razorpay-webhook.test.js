import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyRazorpayWebhook } from './services/razorpay-webhook.js'

test('Razorpay webhook signature security', () => {
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET

  try {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'local-webhook-test-secret'

    const body = Buffer.from(JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_fixture' } } }
    }))

    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex')

    assert.equal(verifyRazorpayWebhook(body, signature), true)
    assert.equal(verifyRazorpayWebhook(body, '0'.repeat(64)), false)
    assert.equal(verifyRazorpayWebhook(Buffer.from('{}'), signature), false)
    assert.equal(verifyRazorpayWebhook(body, 'invalid'), false)
    assert.equal(verifyRazorpayWebhook('not-a-buffer', signature), false)

    delete process.env.RAZORPAY_WEBHOOK_SECRET
    assert.equal(verifyRazorpayWebhook(body, signature), false)
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
    else process.env.RAZORPAY_WEBHOOK_SECRET = previous
  }
})
