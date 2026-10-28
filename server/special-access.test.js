import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

for (const key of Object.keys(process.env)) {
  if (/MONGODB|MONGOMS|RAZORPAY|PAYMENT|DOTENV/i.test(key)) delete process.env[key]
}
const directory = await mkdtemp(path.join(os.tmpdir(), 'innovix-special-access-'))
const emptyEnv = path.join(directory, 'empty.env')
await writeFile(emptyEnv, '')
process.env.DOTENV_CONFIG_PATH = emptyEnv
process.env.DOTENV_CONFIG_OVERRIDE = 'false'
process.env.NODE_ENV = 'test'
process.env.RUN_STARTUP_INITIALIZATION = 'false'
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
process.env.JWT_SECRET = randomBytes(32).toString('hex')
process.env.CLIENT_URL = 'http://127.0.0.1:5173'

const { MongoMemoryReplSet } = await import('mongodb-memory-server')
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } })
process.env.MONGODB_URI = mongo.getUri()

const mongoose = (await import('mongoose')).default
const bcrypt = (await import('bcryptjs')).default
const jwt = (await import('jsonwebtoken')).default
const express = (await import('express')).default
const { env } = await import('./config/env.js')
const { Student, StudentSession } = await import('./models/student.js')
const { Admin } = await import('./models/index.js')
const { InternshipDomain, ensureDomains } = await import('./models/management.js')
const { BatchEnrollment, InternshipBatch, initializeLearningModels } = await import('./models/learning.js')
const { ContentVideo } = await import('./models/content-video.js')
const { csrfFor, hashToken, studentCookieName } = await import('./middleware/student-auth.js')
const adminRoutes = (await import('./routes/admin.js')).default
const studentRoutes = (await import('./routes/student.js')).default
const { learningStudentRoutes } = await import('./routes/learning.js')
const { contentVideoPublicRoutes } = await import('./routes/content-videos.js')

let server
const dbName = `special_access_${randomUUID().replaceAll('-', '')}`

test('admin grants are domain-scoped, receipt-free, and preserve independent Razorpay access', async () => {
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Promise.all([initializeLearningModels(), Student.init(), StudentSession.init(), Admin.init(), ContentVideo.init()])
    await ensureDomains()
    await Promise.all(['Frontend Developer', 'Python Developer', 'Data Analytics', 'Content Creation'].map(name =>
      InternshipDomain.updateOne({ name }, { $set: { recordedClassesEnabled: true } })
    ))

    const password = 'TestOnly@123'
    const admin = await Admin.create({ email: 'special-admin@example.test', passwordHash: await bcrypt.hash(password, 4) })
    const makeStudent = async (name, email, domain) => {
      const student = await Student.create({ fullName: name, email, phone: `+9198765${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`, college: 'Synthetic Test College', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: domain, passwordHash: await bcrypt.hash(password, 4) })
      const token = randomBytes(32).toString('hex')
      const tokenHash = hashToken(token)
      await StudentSession.create({ student: student._id, tokenHash, authVersion: 0, expiresAt: new Date(Date.now() + 3600000) })
      await Student.updateOne({ _id: student._id }, { $set: { activeSessionHash: tokenHash } })
      return { student, headers: { Cookie: `${studentCookieName()}=${token}`, 'X-CSRF-Token': csrfFor(token) } }
    }
    const learner = await makeStudent('Synthetic Learner A', 'learner-a@example.test', 'Content Creation')
    const other = await makeStudent('Synthetic Learner B', 'learner-b@example.test', 'Content Creation')

    const app = express(); app.use(express.json())
    app.use('/api/admin', adminRoutes)
    app.use('/api/student', studentRoutes)
    app.use('/api/student/learning', learningStudentRoutes)
    app.use('/api/content-creation/videos', contentVideoPublicRoutes)
    app.use((error, _req, res, _next) => res.status(500).json({ success: false, message: error.message }))
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api`
    const adminLogin = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password }) })
    assert.equal(adminLogin.status, 200)
    const adminToken = (await adminLogin.json()).data.token
    const call = async (url, method = 'GET', body, headers = {}) => {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Origin: new URL(env.clientUrl).origin, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, ...await response.json() }
    }
    const adminCall = (url, method, body) => call(`/admin${url}`, method, body, { Authorization: `Bearer ${adminToken}` })
    const studentCall = (who, url) => call(`/student/learning${url}`, 'GET', undefined, who.headers)

    const forged = jwt.sign({ id: String(learner.student._id), role: 'admin' }, env.jwtSecret, { expiresIn: '1h' })
    assert.equal((await call(`/admin/students/${learner.student._id}/offline-access`, 'GET', undefined, { Authorization: `Bearer ${forged}` })).status, 403)

    // A synthetic verified live entitlement in this disposable database remains independent.
    const { enrollment: paid } = await (await import('./services/monthly-enrollment.js')).ensureMonthlyEnrollment(learner.student, 'Content Creation')
    await BatchEnrollment.updateOne({ _id: paid._id }, { $set: { paymentMode: 'live', paymentStatus: 'PAID', livePayment: { status: 'Paid', amount: 49900, currency: 'INR', orderId: 'order_synthetic_verified', paymentId: 'pay_synthetic_verified', verifiedAt: new Date() } } })
    assert.equal((await studentCall(learner, '/progress?domain=Content%20Creation')).status, 200)

    const free = await adminCall(`/students/${learner.student._id}/special-access/free`, 'POST', { domain: 'Frontend Developer', confirmGrant: true, reason: 'Synthetic free grant', idempotencyKey: randomUUID() })
    assert.equal(free.status, 201)
    assert.equal((await studentCall(learner, '/progress?domain=Frontend%20Developer')).status, 200)
    assert.equal((await studentCall(learner, '/progress?domain=Python%20Developer')).status, 403)
    assert.equal((await studentCall(other, '/progress?domain=Frontend%20Developer')).status, 403)
    const freeDashboard = await call('/student/dashboard?domain=Frontend%20Developer', 'GET', undefined, learner.headers)
    assert.equal(freeDashboard.status, 200)
    assert.equal(freeDashboard.data.accessLabel, 'Admin Approved — Free Access')
    await ContentVideo.create({ domain: 'Frontend Developer', title: 'Synthetic class', module: 'Test module', description: 'Disposable class fixture', publishDate: new Date(), status: 'published' })
    assert.equal((await call('/content-creation/videos/?domain=Frontend%20Developer', 'GET', undefined, learner.headers)).status, 200)
    assert.equal((await call('/content-creation/videos/?domain=Frontend%20Developer', 'GET', undefined, other.headers)).status, 403)
    assert.equal((await adminCall(`/students/${learner.student._id}/special-access/${free.data.grant._id}/revoke`, 'PATCH', { confirmRevoke: true, reason: 'Synthetic revoke' })).status, 200)
    assert.equal((await studentCall(learner, '/progress?domain=Frontend%20Developer')).status, 403)
    assert.equal((await studentCall(learner, '/progress?domain=Content%20Creation')).status, 200)

    const agreement = await adminCall(`/students/${learner.student._id}/custom-payments`, 'POST', { domain: 'Python Developer', agreedAmountRupees: '333.00', internalNote: 'test only', idempotencyKey: randomUUID() })
    assert.equal(agreement.status, 201)
    assert.equal((await studentCall(learner, '/progress?domain=Python%20Developer')).status, 403)
    const confirmation = { amountRupees: '333.00', method: 'Bank Transfer', transactionReference: 'SYNTHETIC-CUSTOM-REF', paymentDate: new Date().toISOString().slice(0, 10), confirmReceived: true }
    assert.equal((await adminCall(`/students/${learner.student._id}/custom-payments/${agreement.data.payment._id}/confirm`, 'POST', { ...confirmation, amountRupees: '332.99' })).status, 409)
    const custom = await adminCall(`/students/${learner.student._id}/custom-payments/${agreement.data.payment._id}/confirm`, 'POST', confirmation)
    assert.equal(custom.status, 200)
    assert.equal(custom.data.payment.receiptNumber, undefined)
    assert.equal((await studentCall(learner, '/progress?domain=Python%20Developer')).status, 200)
    const pythonDashboard = await call('/student/dashboard?domain=Python%20Developer', 'GET', undefined, learner.headers)
    assert.equal(pythonDashboard.data.accessLabel, 'Admin Approved — Custom Payment')
    assert.equal((await adminCall(`/students/${learner.student._id}/special-access/${custom.data.grant._id}/revoke`, 'PATCH', { confirmRevoke: true, reason: 'Synthetic revoke' })).status, 200)
    assert.equal((await studentCall(learner, '/progress?domain=Python%20Developer')).status, 403)

    const { enrollment: offlineEnrollment } = await (await import('./services/monthly-enrollment.js')).ensureMonthlyEnrollment(learner.student, 'Data Analytics')
    await BatchEnrollment.updateOne({ _id: offlineEnrollment._id }, { $set: { livePayment: { status: 'Pending', amount: 499, currency: 'INR', orderId: 'order_synthetic_pending' } } })
    const paymentBody = { domain: 'Data Analytics', amountRupees: '275.50', method: 'UPI', transactionReference: 'SYNTHETIC-OFFLINE-REF', paymentDate: new Date().toISOString().slice(0, 10), confirmReceived: true, idempotencyKey: randomUUID() }
    const offline = await adminCall(`/students/${learner.student._id}/offline-payments`, 'POST', paymentBody)
    assert.equal(offline.status, 201)
    assert.equal(offline.data.payment.receiptNumber, undefined)
    assert.equal((await studentCall(learner, '/progress?domain=Data%20Analytics')).status, 200)
    assert.equal((await BatchEnrollment.findById(offlineEnrollment._id)).livePayment.status, 'Pending')
    assert.equal((await adminCall(`/students/${learner.student._id}/offline-payments`, 'POST', paymentBody)).data.duplicate, true)
    assert.equal((await adminCall(`/students/${learner.student._id}/offline-access/${offlineEnrollment._id}/revoke`, 'PATCH', { confirmRevoke: true, reason: 'Synthetic revoke' })).status, 200)
    assert.equal((await studentCall(learner, '/progress?domain=Data%20Analytics')).status, 403)
    assert.equal((await studentCall(learner, '/progress?domain=Content%20Creation')).status, 200, 'Revocation preserves the independent verified entitlement')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    await mongo.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
