import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Bypass dotenv and inherited database/provider configuration before application imports.
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
const { Student } = await import('./models/student.js')
const { ensureDomains } = await import('./models/management.js')
const { ensureMonthlyEnrollment, indiaMonth } = await import('./services/monthly-enrollment.js')
const { studentHasDomainAccess } = await import('./services/learning-access.js')
const { paymentRecords } = await import('./controllers/learning-progress.js')
let mongo
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } })
})
after(async () => { await mongoose.disconnect(); await mongo?.stop() })

test('IST boundaries use the India month, including year rollover', () => {
  assert.deepEqual(indiaMonth(new Date('2026-10-31T18:29:59Z')), { month: 10, year: 2026 })
  assert.deepEqual(indiaMonth(new Date('2026-10-31T18:30:00Z')), { month: 11, year: 2026 })
  assert.deepEqual(indiaMonth(new Date('2026-12-31T18:30:00Z')), { month: 1, year: 2027 })
})

test('automatic monthly enrollments are concurrent-safe, reported by month/domain and preserve historical paid access', async () => {
  const dbName = `monthly_${randomUUID().slice(0, 8)}`
  try {
    const uri = mongo.getUri(dbName)
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
    await Promise.all([BatchEnrollment.init(), InternshipBatch.init(), ensureDomains()])
    const student = { _id: new mongoose.Types.ObjectId(), internshipDomain: 'Frontend Developer' }
    // Insert only synthetic identity fields needed by this reporting fixture.
    await Student.collection.insertOne({ ...student, studentId: 'MONTHLY-OCT', fullName: 'October Student', email: 'october@example.invalid' })
    const oct = new Date('2026-10-31T18:29:59Z')
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureMonthlyEnrollment(student, 'frontend-developer', oct)))
    assert.equal(new Set(results.map(x => String(x.enrollment._id))).size, 1)
    const item = results[0].enrollment
    assert.equal(item.batch.code, 'FRONTEND-DEVELOPER-2026-10')
    assert.equal(item.month, 10); assert.equal(item.year, 2026)
    assert.equal(item.paymentStatus, 'NOT_PAID'); assert.equal(item.learningAccessStatus, 'LOCKED')
    assert.equal(results[0].domain.price, 499)
    assert.equal(await studentHasDomainAccess(student), false)
    assert.equal(await BatchEnrollment.countDocuments(), 1)
    assert.equal(await InternshipBatch.countDocuments(), 1)
    assert.equal((await InternshipBatch.findById(item.batch._id)).enrollmentCount, 1)
    await ensureMonthlyEnrollment(student, student.internshipDomain, oct)
    assert.equal((await InternshipBatch.findById(item.batch._id)).enrollmentCount, 1)
    const python = { _id: new mongoose.Types.ObjectId(), internshipDomain: 'Python Developer' }
    await Student.collection.insertOne({ ...python, studentId: 'MONTHLY-NOV', fullName: 'November Student', email: 'november@example.invalid' })
    const nov = await ensureMonthlyEnrollment(python, 'Python Developer', new Date('2026-10-31T18:30:00Z'))
    assert.equal(nov.enrollment.batch.code, 'PYTHON-DEVELOPER-2026-11')
    const records = async query => {
      let body
      await paymentRecords({ query }, { status() { return this }, json(value) { body = value } })
      return body.data
    }
    const october = await records({ month: '10', year: '2026', paymentStatus: 'NOT_PAID', search: 'OCTOBER@' })
    assert.equal(october.summary.total, 1); assert.equal(october.summary.notPaid, 1)
    assert.equal(october.internships[0].learningAccessStatus, 'LOCKED')
    const november = await records({ month: '11', year: '2026', domain: 'Python Developer' })
    assert.equal(november.summary.total, 1)
    assert.equal(november.summary.domains[0].name, 'Python Developer')
    assert.equal((await records({})).summary.monthly.length, 2)
    // Existing Admin-recorded Paid enrollments remain valid and are never charged again.
    await BatchEnrollment.updateOne({ _id: item._id }, { $set: { paymentStatus: 'Paid' } })
    const retained = await ensureMonthlyEnrollment(student, student.internshipDomain, new Date('2026-11-20'))
    assert.equal(String(retained.enrollment._id), String(item._id))
    assert.equal(await studentHasDomainAccess(student), true)
    assert.equal((await records({ paymentStatus: 'PAID' })).summary.paid, 1)
    assert.equal(await BatchEnrollment.countDocuments(), 2)
    assert.equal((await InternshipBatch.findById(item.batch._id)).enrollmentCount, 1)
    assert.equal((await InternshipBatch.findById(nov.enrollment.batch._id)).enrollmentCount, 1)
    // Two distinct students compete for the final seat; no overbooking or orphan enrollment.
    await InternshipBatch.updateOne({ _id: item.batch._id }, { $set: { maxStudents: 2 } })
    const contenders = Array.from({ length: 2 }, () => ({ _id: new mongoose.Types.ObjectId(), internshipDomain: student.internshipDomain }))
    const seats = await Promise.allSettled(contenders.map(candidate => ensureMonthlyEnrollment(candidate, candidate.internshipDomain, oct)))
    assert.equal(seats.filter(result => result.status === 'fulfilled').length, 1)
    assert.match(seats.find(result => result.status === 'rejected').reason.message, /full or unavailable/)
    assert.equal((await InternshipBatch.findById(item.batch._id)).enrollmentCount, 2)
    assert.equal(await BatchEnrollment.countDocuments({ batch: item.batch._id }), 2)
    // An insert failure must roll back the reserved seat.
    const invalid = { _id: new mongoose.Types.ObjectId(), internshipDomain: python.internshipDomain }
    const originalCreate = BatchEnrollment.create
    BatchEnrollment.create = async () => { throw new Error('simulated enrollment insert failure') }
    try {
      await assert.rejects(ensureMonthlyEnrollment(invalid, invalid.internshipDomain, new Date('2026-11-10')), /simulated enrollment insert failure/)
    } finally { BatchEnrollment.create = originalCreate }
    assert.equal((await InternshipBatch.findById(nov.enrollment.batch._id)).enrollmentCount, 1)
    assert.equal(await BatchEnrollment.countDocuments({ student: invalid._id }), 0)
    await assert.rejects(ensureMonthlyEnrollment({ ...student, internshipDomain: 'AI Tools' }, 'AI Tools'), /unavailable/)
    // A student may join another internship without losing the original paid enrollment.
    const secondDomain = await ensureMonthlyEnrollment(student, 'Python Developer')
    assert.equal(secondDomain.enrollment.domain, 'Python Developer')
    assert.equal(secondDomain.enrollment.paymentStatus, 'NOT_PAID')
    assert.notEqual(String(secondDomain.enrollment._id), String(item._id))
    assert.equal((await BatchEnrollment.findById(item._id)).paymentStatus, 'Paid')
  } finally {
    if (mongoose.connection.name === dbName && dbName.startsWith('monthly_')) await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  }
})
