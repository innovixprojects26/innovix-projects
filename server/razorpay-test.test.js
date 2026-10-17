import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { InternshipBatch, BatchEnrollment } from './models/learning.js'
import { InternshipDomain } from './models/management.js'
import { createOrder, quote, verify, localTestOnly } from './controllers/internship-payments.js'
import { paymentRecords } from './controllers/learning-progress.js'
import { learningError } from './services/learning-access.js'
import { testCredentials } from './services/razorpay-test.js'

test('local test checkout: backend pricing, duplicate-safe orders, HMAC/capture verification and enrollment preservation', async () => {
  // Synthetic credentials and isolated local database only; never use the configured account.
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture'
  process.env.RAZORPAY_KEY_SECRET = 'synthetic-test-secret'
  const database = `ipt_${randomUUID().replaceAll('-', '')}`
  const realFetch = globalThis.fetch
  let mongo, server, creates = 0, captured = true, amount = 64900
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options)
    if (String(url).endsWith('/orders')) {
      creates++
      const body = JSON.parse(options.body)
      assert.equal(body.amount, 64900, 'Price comes from Admin domain, not frontend')
      assert.equal(body.notes.purpose, 'internship_test')
      return Response.json({ id: 'order_fixture', amount: body.amount, currency: 'INR' })
    }
    return Response.json({ id: 'pay_fixture', order_id: 'order_fixture', amount, currency: 'INR', status: captured ? 'captured' : 'authorized', captured, amount_refunded: 0 })
  }
  try {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: database, serverSelectionTimeoutMS: 10000 })
    await BatchEnrollment.init()
    const student = { _id: new mongoose.Types.ObjectId(), internshipDomain: 'Python Developer' }
    const batch = await InternshipBatch.create({ name: 'Payment test', domain: 'Python Developer', code: 'PAY-TEST', startDate: new Date(), endDate: new Date(), mentor: 'Test', maxStudents: 10, status: 'Active' })
    await InternshipDomain.create({ name: 'Python Developer', price: 649 })
    const enrollment = await BatchEnrollment.create({ student: student._id, batch: batch._id })
    const app = express(); app.use(express.json())
    app.use((req, _res, next) => { req.student = req.headers['x-other-student'] ? { ...student, _id: new mongoose.Types.ObjectId() } : student; next() })
    app.get('/quote', localTestOnly, quote); app.post('/order', localTestOnly, createOrder); app.post('/verify', localTestOnly, verify); app.get('/records', paymentRecords); app.use(learningError)
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const call = async (path, body, headers = {}) => {
      const response = await realFetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, ...(await response.json()) }
    }
    assert.equal((await call('/quote')).data.fee, 649)
    const concurrent = await Promise.all([call('/order', { amount: 1, project: 'ignored' }), call('/order', {})])
    assert.ok(concurrent.some(result => result.status === 200)); assert.equal(creates, 1)
    const order = await call('/order', {})
    assert.equal(order.data.orderId, 'order_fixture'); assert.equal(creates, 1)
    assert.equal(JSON.stringify(order).includes('synthetic-test-secret'), false)
    await InternshipDomain.updateOne({ name: 'Python Developer' }, { $set: { price: 799 } })
    assert.equal((await call('/order', {})).data.amount, 64900, 'Existing order retains its price snapshot')
    const details = { razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: '0'.repeat(64) }
    assert.equal((await call('/verify', details)).status, 400)
    details.razorpay_signature = createHmac('sha256', 'synthetic-test-secret').update('order_fixture|pay_fixture').digest('hex')
    assert.equal((await call('/verify', details, { 'x-other-student': '1' })).status, 404)
    amount = 100; assert.equal((await call('/verify', details)).status, 409); amount = 64900
    captured = false; assert.equal((await call('/verify', details)).status, 409); captured = true
    assert.equal((await call('/verify', details)).data.status, 'Paid')
    assert.equal((await call('/verify', details)).data.status, 'Paid', 'Verification is idempotent')
    assert.equal((await call('/order', {})).data.status, 'Paid'); assert.equal(creates, 1)
    const saved = await BatchEnrollment.findById(enrollment._id).lean()
    assert.equal(saved.paymentStatus, 'Not Paid'); assert.equal(saved.status, 'Enrolled')
    assert.equal(saved.testPayment.paymentId, 'pay_fixture'); assert.ok(saved.testPayment.verifiedAt)
    assert.equal(await BatchEnrollment.countDocuments(), 1)
    const records = (await call('/records')).data
    assert.equal(records.internships[0].status, 'Not Paid (TEST: Paid)'); assert.equal(records.internships[0].fee, 649); assert.deepEqual(records.projects, [])
    process.env.RAZORPAY_KEY_ID = 'rzp_live_fixture'
    assert.throws(testCredentials, /LIVE payments are disabled/)
  } finally {
    globalThis.fetch = realFetch
    if (server) await new Promise(resolve => server.close(resolve))
    if (mongoose.connection.name === database && database.startsWith('ipt_')) await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    if (mongo) await mongo.stop()
  }
})
