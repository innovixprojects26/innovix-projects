import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { recoverLiveOrder } from './controllers/internship-live-payments.js'
import { BatchEnrollment, InternshipBatch } from './models/learning.js'
import { Student } from './models/student.js'
import { paymentAllowsLearning } from './services/monthly-enrollment.js'

test('authenticated LIVE recovery requires captured owned payment', async () => {
  const keys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_ENABLED']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch

  let mongo
  const amount = 49900
  const orderId = 'order_recoverycontroller'
  const paymentId = 'pay_recoverycontroller'

  process.env.RAZORPAY_KEY_ID = 'rzp_live_recoveryfixture'
  process.env.RAZORPAY_KEY_SECRET = 'synthetic-recovery-secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'synthetic-webhook-secret'
  process.env.RAZORPAY_LIVE_ENABLED = 'true'

  let enrollment
  let payments = []
  let currentPayment = {
    id: paymentId,
    order_id: orderId,
    amount,
    currency: 'INR',
    status: 'captured',
    captured: true,
    amount_refunded: 0
  }

  const response = () => ({
    status() { return this },
    json(payload) { this.payload = payload; return this }
  })

  try {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: 'isolated_recovery_controller' })

    await Promise.all([
      BatchEnrollment.init(),
      InternshipBatch.init(),
      Student.init()
    ])

    const studentId = new mongoose.Types.ObjectId()
    const otherStudentId = new mongoose.Types.ObjectId()

    await Student.collection.insertMany([
      {
        _id: studentId,
        studentId: 'RECOVERY-STUDENT-001',
        email: 'recovery-student-001@example.com'
      },
      {
        _id: otherStudentId,
        studentId: 'RECOVERY-STUDENT-002',
        email: 'recovery-student-002@example.com'
      }
    ])

    const batch = await InternshipBatch.create({
      name: 'Recovery cohort',
      domain: 'Python Developer',
      code: 'RECOVERY-2026',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
      mentor: 'Fixture',
      maxStudents: 10,
      status: 'Active',
      enabled: true
    })

    enrollment = await BatchEnrollment.create({
      student: studentId,
      batch: batch._id,
      domain: 'Python Developer',
      status: 'Enrolled',
      paymentStatus: 'NOT_PAID',
      learningAccessStatus: 'LOCKED',
      livePayment: {
        status: 'Pending',
        amount,
        currency: 'INR',
        orderId
      }
    })

    globalThis.fetch = async url => {
      const path = String(url)

      if (path.endsWith(`/orders/${orderId}/payments?count=100&skip=0`)) {
        return Response.json({ count: payments.length, items: payments })
      }

      if (path.endsWith(`/orders/${orderId}`)) {
        return Response.json({
          id: orderId,
          amount,
          currency: 'INR',
          receipt: `il_${enrollment._id}`,
          notes: {
            purpose: 'internship_live',
            enrollment: String(enrollment._id)
          }
        })
      }

      if (path.endsWith(`/payments/${paymentId}`)) {
        return Response.json(currentPayment)
      }

      throw new Error(`Unexpected mocked request: ${path}`)
    }

    const student = { _id: studentId }
    const otherStudent = { _id: otherStudentId }

    await assert.rejects(
      () => recoverLiveOrder({
        student,
        body: { domain: 'invalid-domain-xyz' }
      }, response()),
      { status: 400 }
    )
    const pendingResponse = response()
    await recoverLiveOrder({ student, body: { domain: 'Python Developer' } }, pendingResponse)
    assert.equal(pendingResponse.payload.data.status, 'Pending')
    assert.equal(
      paymentAllowsLearning(await BatchEnrollment.findById(enrollment._id).lean()),
      false
    )

    payments = [currentPayment]

    await assert.rejects(
      () => recoverLiveOrder({ student: otherStudent, body: { domain: 'Python Developer' } }, response()),
      { status: 404 }
    )

    assert.equal(
      paymentAllowsLearning(await BatchEnrollment.findById(enrollment._id).lean()),
      false
    )

    const paidResponse = response()
    await recoverLiveOrder({ student, body: { domain: 'Python Developer' } }, paidResponse)

    assert.equal(paidResponse.payload.data.status, 'Paid')
    assert.equal(
      paymentAllowsLearning(await BatchEnrollment.findById(enrollment._id).lean()),
      true
    )

    currentPayment = {
      ...currentPayment,
      status: 'refunded',
      amount_refunded: amount
    }

    payments = [currentPayment]

    // A provider refund must revoke access through reconciliation.
    // The controller's existing Paid short-circuit is expected to
    // require correction if this assertion fails.
    const refundResponse = response()
    await recoverLiveOrder({ student, body: { domain: 'Python Developer' } }, refundResponse)

    assert.equal(
      paymentAllowsLearning(await BatchEnrollment.findById(enrollment._id).lean()),
      false,
      'Refunded LIVE payment must never retain learning access'
    )
  } finally {
    globalThis.fetch = originalFetch
    await mongoose.disconnect()
    if (mongo) await mongo.stop()

    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
