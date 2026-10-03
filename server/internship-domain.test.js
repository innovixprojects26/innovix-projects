import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { env } from './config/env.js'
import { Admin, InternshipApplication } from './models/index.js'
import { Student, StudentSession } from './models/student.js'
import { InternshipBatch, BatchEnrollment, initializeLearningModels } from './models/learning.js'
import { InternshipDomain, getDomain } from './models/management.js'
import { hashToken, studentCookieName } from './middleware/student-auth.js'
import adminRoutes from './routes/admin.js'
import studentRoutes from './routes/student.js'
import { learningAdminRoutes } from './routes/learning.js'
import { studentDomains } from '../shared/student.js'
import { normalizeInternshipDomain, sameInternshipDomain, isEligibleBatch } from '../shared/internship-domain.js'

test('known domain names, slugs and aliases share eligibility without cross-domain access', () => {
  for (const domain of studentDomains) {
    assert.equal(normalizeInternshipDomain(` ${domain.toUpperCase()} `), domain)
    assert.ok(sameInternshipDomain(domain, domain.toLowerCase().replace(/[^a-z0-9]+/g, '-')))
  }
  assert.ok(sameInternshipDomain('Frontend Development', 'Frontend Developer'))
  assert.ok(sameInternshipDomain('UI/UX Design', 'ui-ux-designer'))
  assert.ok(sameInternshipDomain('Python Development', 'Python Developer'))
  assert.equal(sameInternshipDomain('unknown', 'unknown'), false)
  assert.equal(sameInternshipDomain('Cyber Security', 'Content Creation'), false)
  const application = { domain: 'CYBER-SECURITY' }
  const batch = { domain: 'Cyber Security', enabled: true, status: 'Active', enrollmentCount: 0, maxStudents: 2 }
  assert.equal(isEligibleBatch(application, batch), true)
  for (const change of [{ domain: 'Content Creation' }, { enabled: false }, { status: 'Draft' }, { status: 'Cancelled' }, { status: 'Completed' }, { enrollmentCount: 2 }]) assert.equal(isEligibleBatch(application, { ...batch, ...change }), false)
})

test('authenticated domain URL, eligible batch API and transactional approval for every internship', async () => {
  const dbName = `dom_${randomUUID().replaceAll('-', '')}`
  let server
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Promise.all([Admin.init(), Student.init(), StudentSession.init(), InternshipDomain.init(), initializeLearningModels()])
    const admin = await Admin.create({ email: 'domain-admin@example.test', passwordHash: 'unused-test-hash' })
    const token = jwt.sign({ id: admin._id.toString() }, env.jwtSecret, { expiresIn: '5m' })
    const app = express()
    app.use(express.json())
    app.use('/api/admin/learning', learningAdminRoutes)
    app.use('/api/admin', adminRoutes)
    app.use('/api/student', studentRoutes)
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }))
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const request = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, ...await response.json() }
    }
    assert.equal((await request('/student/dashboard')).status, 401)
    for (const [index, domain] of studentDomains.entries()) {
      const variant = domain === 'Frontend Developer' ? 'frontend-development' : domain.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const track = await InternshipDomain.create({ name: domain, liveClassEnabled: true, meetingUrl: `https://example.test/live/${index}` })
      assert.equal((await getDomain(variant)).name, domain)
      const student = await Student.create({ fullName: 'Test Learner', email: `domain-${index}@example.test`, phone: '+919876543210', college: 'Example College', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: domain, passwordHash: 'unused-test-hash' })
      const sessionToken = randomBytes(32).toString('hex')
      await StudentSession.create({ student: student._id, tokenHash: hashToken(sessionToken), authVersion: 0, expiresAt: new Date(Date.now() + 600000) })
      const cookie = `${studentCookieName()}=${sessionToken}`
      const dashboard = async () => (await request('/student/dashboard', 'GET', undefined, cookie)).data
      assert.equal((await dashboard()).liveClassUrl, null)
      const application = await InternshipApplication.create({ name: 'Test Applicant', email: student.email, domain: variant, status: 'Pending' })
      const batch = await InternshipBatch.create({ name: 'Test Batch', domain: variant, code: `DOMAIN-${index}`, startDate: new Date(), endDate: new Date(Date.now() + 86400000), mentor: 'Test Mentor', maxStudents: 2, status: 'Active', enabled: true })
      const unrelated = await InternshipBatch.create({ name: 'Unrelated Batch', domain: domain === 'Content Creation' ? 'Cyber Security' : 'Content Creation', code: `OTHER-${index}`, startDate: new Date(), endDate: new Date(Date.now() + 86400000), mentor: 'Test Mentor', maxStudents: 2, status: 'Active', enabled: true })
      const listed = await request('/admin/learning/batches')
      assert.equal(listed.status, 200)
      const eligible = listed.data.filter(item => isEligibleBatch(application, item))
      assert.ok(eligible.some(item => item._id === String(batch._id)))
      assert.ok(!eligible.some(item => item._id === String(unrelated._id)))
      const approve = batchId => request(`/admin/internships/${application._id}/decision`, 'PATCH', { decision: 'Approved', batchId: String(batchId) })
      assert.equal((await approve(unrelated._id)).status, 409)
      assert.equal((await approve(batch._id)).status, 200)
      assert.equal((await approve(batch._id)).status, 200)
      assert.equal(await BatchEnrollment.countDocuments({ student: student._id }), 1)
      assert.equal((await InternshipBatch.findById(batch._id)).enrollmentCount, 1)
      assert.equal((await InternshipApplication.findById(application._id)).status, 'Approved')
      assert.equal((await dashboard()).liveClassUrl, track.meetingUrl)
      const setTrack = async body => assert.equal((await request(`/admin/internship-domains/${track._id}`, 'PATCH', body)).status, 200)
      await setTrack({ liveClassEnabled: false })
      assert.equal((await dashboard()).liveClassUrl, null)
      await setTrack({ liveClassEnabled: true, meetingUrl: '' })
      assert.equal((await dashboard()).liveClassUrl, null)
      await setTrack({ meetingUrl: track.meetingUrl })
      assert.equal((await dashboard()).liveClassUrl, track.meetingUrl)
      await InternshipDomain.updateOne({ _id: track._id }, { $set: { meetingUrl: 'javascript:alert(1)' } })
      assert.equal((await dashboard()).liveClassUrl, null)
      await setTrack({ meetingUrl: track.meetingUrl })
      // Legacy student and domain record spellings must resolve to the same saved URL.
      await Student.collection.updateOne({ _id: student._id }, { $set: { internshipDomain: variant } })
      await InternshipDomain.updateOne({ _id: track._id }, { $set: { name: variant } })
      assert.equal((await dashboard()).liveClassUrl, track.meetingUrl)
      const rejected = await InternshipApplication.create({ name: 'Rejected Test', email: `reject-${index}@example.test`, domain, status: 'Pending' })
      assert.equal((await request(`/admin/internships/${rejected._id}/decision`, 'PATCH', { decision: 'Rejected' })).status, 200)
      assert.equal(await BatchEnrollment.countDocuments({ application: rejected._id }), 0)
      assert.equal((await request(`/admin/internships/${rejected._id}/decision`, 'PATCH', { decision: 'Approved', batchId: String(batch._id) })).status, 409)
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  }
})
