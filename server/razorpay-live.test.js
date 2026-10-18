import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { livePaymentAvailability, verifyLiveSignature, verifiedLivePayment } from './services/razorpay-live.js'
import { createLiveOrder, verifyLiveOrder, liveStatus } from './controllers/internship-live-payments.js'
import { WebsiteConfig, InternshipDomain } from './models/management.js'
import { InternshipBatch, BatchEnrollment } from './models/learning.js'
import { Student } from './models/student.js'
import { paymentAllowsLearning } from './services/monthly-enrollment.js'

test('LIVE readiness fails closed; mocked orders, capture, ownership and retries preserve access', async () => {
  const keys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_ENABLED']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  let mongo, creates = 0, orderMetadata
  process.env.RAZORPAY_KEY_ID = 'rzp_live_syntheticfixture'
  process.env.RAZORPAY_KEY_SECRET = 'synthetic-live-unit-secret'
  delete process.env.RAZORPAY_WEBHOOK_SECRET
  const captured = { id: 'pay_fixture', order_id: 'order_fixture', amount: 64900, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 }
  let remote = { ...captured }
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://api.razorpay.com/v1/'))
    if (String(url).endsWith('/orders')) {
      creates++
      const body = JSON.parse(options.body)
      assert.equal(body.amount, 64900)
      assert.equal(body.notes.purpose, 'internship_live')
      orderMetadata = body
      return Response.json({ id: 'order_fixture', amount: 64900, currency: 'INR' })
    }
    if (String(url).includes('/orders/')) return Response.json({ id: 'order_fixture', ...orderMetadata })
    return Response.json(remote)
  }
  const sign = (order = 'order_fixture', payment = 'pay_fixture') => createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order}|${payment}`).digest('hex')
  const details = { razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign() }
  const response = () => ({ json(payload) { this.payload = payload; return this }, status() { return this } })
  try {
    assert.equal(livePaymentAvailability(false).available, false)
    assert.equal(livePaymentAvailability(true).available, false)
    process.env.RAZORPAY_WEBHOOK_SECRET = 'synthetic-webhook-secret'
    delete process.env.RAZORPAY_LIVE_ENABLED
    assert.equal(livePaymentAvailability(true).available, false, 'Explicit activation required')
    process.env.RAZORPAY_LIVE_ENABLED = 'true'
    assert.equal(livePaymentAvailability(true).available, true)
    assert.ok(verifyLiveSignature('order_fixture', 'pay_fixture', sign()))
    assert.equal(verifyLiveSignature('order_fixture', 'pay_fixture', '0'.repeat(64)), false)
    const record = { orderId: 'order_fixture', amount: 64900 }
    for (const change of [{ amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }, { status: 'authorized' }, { captured: false }, { amount_refunded: 1 }]) {
      remote = { ...captured, ...change }
      await assert.rejects(() => verifiedLivePayment(record, details), { status: 409 })
    }
    remote = { ...captured }
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: 'isolated_live_readiness' })
    await Promise.all([BatchEnrollment.init(), InternshipBatch.init(), InternshipDomain.init()])
    await WebsiteConfig.create({ settings: { internshipPaymentsEnabled: true, batchesEnabled: true } })
    const statusResponse = response(); await liveStatus({}, statusResponse)
    assert.equal(statusResponse.payload.data.available, true)
    assert.ok(!JSON.stringify(statusResponse.payload).includes(process.env.RAZORPAY_KEY_SECRET))
    await InternshipDomain.create({ name: 'Python Developer', price: 649 })
    const student = { _id: new mongoose.Types.ObjectId(), internshipDomain: 'Python Developer' }
    await Student.collection.insertOne({ _id: student._id })
    const batch = await InternshipBatch.create({ name: 'Synthetic cohort', domain: student.internshipDomain, code: 'SYNTHETIC-LIVE', startDate: new Date(), endDate: new Date(Date.now()+86400000), mentor: 'Fixture', maxStudents: 5, status: 'Active', enabled: true })
    const enrollment = await BatchEnrollment.create({ student: student._id, batch: batch._id })
    const req = { student, body: { domain: student.internshipDomain, amount: 1 } }
    await createLiveOrder(req, response()); await createLiveOrder(req, response())
    assert.equal(creates, 1, 'Repeated initialization reuses the stored provider order')
    assert.equal(paymentAllowsLearning(await BatchEnrollment.findById(enrollment._id).lean()), false)
    await assert.rejects(() => verifyLiveOrder({ student: { _id: new mongoose.Types.ObjectId() }, body: details }, response()), { status: 404 })
    await assert.rejects(() => verifyLiveOrder({ student, body: { ...details, razorpay_signature: '0'.repeat(64) } }, response()), { status: 400 })
    await verifyLiveOrder({ student, body: details }, response())
    await verifyLiveOrder({ student, body: details }, response())
    assert.equal(paymentAllowsLearning(await BatchEnrollment.findById(enrollment._id).lean()), true)
    assert.equal(await BatchEnrollment.countDocuments(), 1)
  } finally {
    globalThis.fetch = originalFetch
    await mongoose.disconnect()
    if (mongo) await mongo.stop()
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
  }
})
