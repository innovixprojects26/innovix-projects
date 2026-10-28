import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'

for (const key of Object.keys(process.env)) {
  if (/MONGODB|MONGOMS|RAZORPAY|PAYMENT|DOTENV/i.test(key)) delete process.env[key]
}
process.env.DOTENV_CONFIG_PATH = join(tmpdir(), `innovix-no-env-${randomUUID()}`)
process.env.DOTENV_CONFIG_OVERRIDE = 'false'
process.env.NODE_ENV = 'test'
process.env.RUN_STARTUP_INITIALIZATION = 'false'
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'

const { MongoMemoryReplSet } = await import('mongodb-memory-server')
const { BatchEnrollment, InternshipBatch } = await import('./models/learning.js')
const { ensureDomains } = await import('./models/management.js')
const { ensureMonthlyEnrollment } = await import('./services/monthly-enrollment.js')
const { studentHasDomainAccess } = await import('./services/learning-access.js')

let mongo

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1' }
  })
})

after(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

test('one student can hold two independent active internship enrollments', async () => {
  const dbName = `multi_${randomUUID().slice(0, 8)}`
  await mongoose.connect(mongo.getUri(dbName))

  try {
    await Promise.all([
      BatchEnrollment.init(),
      InternshipBatch.init(),
      ensureDomains()
    ])

    const student = {
      _id: new mongoose.Types.ObjectId(),
      internshipDomain: 'Frontend Developer'
    }

    const frontend = await ensureMonthlyEnrollment(
      student,
      'Frontend Developer'
    )

    const python = await ensureMonthlyEnrollment(
      student,
      'Python Developer'
    )

    assert.notEqual(
      String(frontend.enrollment._id),
      String(python.enrollment._id)
    )

    const enrollments = await BatchEnrollment.find({
      student: student._id,
      status: 'Enrolled'
    }).lean()

    assert.equal(enrollments.length, 2)

    assert.deepEqual(
      enrollments.map(item => item.domain).sort(),
      ['Frontend Developer', 'Python Developer']
    )

    assert.ok(
      enrollments.every(item =>
        ['Not Paid', 'NOT_PAID'].includes(item.paymentStatus)
      )
    )

    // Synthetic verified/admin-paid Frontend enrollment.
    await BatchEnrollment.updateOne(
      { _id: frontend.enrollment._id },
      { $set: { paymentStatus: 'Paid' } }
    )

    // Reload the updated enrollment instead of using the stale pre-payment object.
    const paidFrontend = await BatchEnrollment.findById(
      frontend.enrollment._id
    ).populate('batch').lean()

    // Payment in one domain must never unlock another domain.
    assert.equal(
      await studentHasDomainAccess(student, paidFrontend),
      true,
      'Paid Frontend must be accessible'
    )

    assert.equal(
      await studentHasDomainAccess(student, python.enrollment),
      false,
      'Unpaid Python must remain locked'
    )

    await BatchEnrollment.updateOne({ _id: python.enrollment._id }, { $set: { paymentStatus: 'Paid' } })
    const paidPython = await BatchEnrollment.findById(python.enrollment._id).populate('batch').lean()
    assert.equal(await studentHasDomainAccess(student, paidPython), true, 'Paid Python must unlock independently')
    assert.equal(await studentHasDomainAccess(student, await BatchEnrollment.findById(paidFrontend._id).populate('batch').lean()), true)
    assert.equal(await studentHasDomainAccess({ ...student, _id: new mongoose.Types.ObjectId() }, paidPython), false)
    const repeated = await Promise.all(Array.from({ length: 6 }, () => ensureMonthlyEnrollment(student, 'Python Development')))
    assert.ok(repeated.every(item => String(item.enrollment._id) === String(paidPython._id)))
    assert.equal(await BatchEnrollment.countDocuments({ student: student._id }), 2)
    assert.equal((await InternshipBatch.findById(paidPython.batch._id)).enrollmentCount, 1)
  } finally {
    await mongoose.disconnect()
  }
})
