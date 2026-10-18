import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCapturedOrderPayment } from './services/razorpay-order-recovery.js'

test('LIVE order recovery rejects ambiguous payments and identifies one capture', async () => {
  const previousKey = process.env.RAZORPAY_KEY_ID
  const previousSecret = process.env.RAZORPAY_KEY_SECRET
  const originalFetch = globalThis.fetch

  process.env.RAZORPAY_KEY_ID = 'rzp_live_recoveryfixture'
  process.env.RAZORPAY_KEY_SECRET = 'synthetic-recovery-secret'

  const orderId = 'order_recoveryfixture'
  const amount = 49900
  const enrollmentId = '507f1f77bcf86cd799439011'

  const payment = (id, changes = {}) => ({
    id,
    order_id: orderId,
    amount,
    currency: 'INR',
    status: 'captured',
    captured: true,
    amount_refunded: 0,
    ...changes
  })

  let order = {
    id: orderId,
    amount,
    currency: 'INR',
    receipt: `il_${enrollmentId}`,
    notes: { purpose: 'internship_live', enrollment: enrollmentId }
  }

  let items = []
  let countOverride

  globalThis.fetch = async url => {
    const path = String(url)

    if (path.endsWith(`/orders/${orderId}`)) {
      return Response.json(order)
    }

    if (path.includes(`/orders/${orderId}/payments`)) {
      return Response.json({
        count: countOverride ?? items.length,
        items
      })
    }

    throw new Error(`Unexpected mocked request: ${path}`)
  }

  try {
    items = []
    assert.deepEqual(
      await findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 'Pending', paymentId: null }
    )

    items = [payment('pay_success')]
    assert.deepEqual(
      await findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 'Found', paymentId: 'pay_success' }
    )

    items = [
      payment('pay_failed', {
        status: 'failed',
        captured: false
      }),
      payment('pay_success')
    ]
    assert.equal(
      (await findCapturedOrderPayment(orderId, amount, enrollmentId)).paymentId,
      'pay_success'
    )

    items = [
      payment('pay_first'),
      payment('pay_second')
    ]
    await assert.rejects(
      () => findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 409 }
    )

    items = [payment('pay_refunded', {
      status: 'refunded',
      amount_refunded: amount
    })]
    assert.equal(
      (await findCapturedOrderPayment(orderId, amount, enrollmentId)).paymentId,
      'pay_refunded'
    )

    items = [payment('pay_wrongamount', { amount: 100 })]
    await assert.rejects(
      () => findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 409 }
    )

    items = [payment('pay_wrongorder', {
      order_id: 'order_other'
    })]
    await assert.rejects(
      () => findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 409 }
    )

    items = [payment('pay_pending', {
      status: 'authorized',
      captured: false
    })]
    assert.deepEqual(
      await findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 'Pending', paymentId: null }
    )

    items = [payment('pay_success')]
    countOverride = 101
    await assert.rejects(
      () => findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 409 }
    )

    countOverride = undefined
    order = { ...order, amount: 100 }
    await assert.rejects(
      () => findCapturedOrderPayment(orderId, amount, enrollmentId),
      { status: 409 }
    )

    await assert.rejects(
      () => findCapturedOrderPayment('invalid_order', amount, enrollmentId),
      { status: 409 }
    )
  } finally {
    globalThis.fetch = originalFetch

    if (previousKey === undefined) {
      delete process.env.RAZORPAY_KEY_ID
    } else {
      process.env.RAZORPAY_KEY_ID = previousKey
    }

    if (previousSecret === undefined) {
      delete process.env.RAZORPAY_KEY_SECRET
    } else {
      process.env.RAZORPAY_KEY_SECRET = previousSecret
    }
  }
})
