import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paymentAllowsLearning } from './services/monthly-enrollment.js'

test('LIVE payment requires verified Razorpay capture record', () => {
  const base = {
    paymentStatus: 'PAID',
    paymentMode: 'live'
  }

  assert.equal(paymentAllowsLearning(base), false)

  assert.equal(paymentAllowsLearning({
    ...base,
    livePayment: { status: 'Pending', orderId: 'order_example' }
  }), false)

  assert.equal(paymentAllowsLearning({
    ...base,
    livePayment: {
      status: 'Paid',
      orderId: 'order_example',
      paymentId: 'pay_example',
      verifiedAt: new Date()
    }
  }), true)
})

test('Existing manually recorded paid enrollment remains valid', () => {
  assert.equal(paymentAllowsLearning({
    paymentStatus: 'Paid'
  }), true)
})

test('Unpaid enrollment cannot access learning', () => {
  assert.equal(paymentAllowsLearning({
    paymentStatus: 'NOT_PAID'
  }), false)
})
