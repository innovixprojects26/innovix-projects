import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { env } from './config/env.js'
import { InternshipApplication } from './models/index.js'
import { Student, StudentSession } from './models/student.js'
import { InternshipDomain } from './models/management.js'
import { InternshipBatch, BatchEnrollment, initializeLearningModels } from './models/learning.js'
import { hashToken, studentCookieName } from './middleware/student-auth.js'
import adminRoutes from './routes/admin.js'
import studentRoutes from './routes/student.js'
import { learningAdminRoutes } from './routes/learning.js'
import { studentHasDomainAccess } from './services/learning-access.js'

test('direct approval grants live-class access without batches; reject denies access; batch management still assigns once', async () => {
  const dbName = `apr_${randomUUID().replaceAll('-', '')}`
  let server
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Promise.all([Student.init(), StudentSession.init(), initializeLearningModels()])
    const app = express()
    app.use(express.json())
    app.use('/admin/learning', learningAdminRoutes)
    app.use('/admin', adminRoutes)
    app.use('/student', studentRoutes)
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }))
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const token = jwt.sign({ id: 'test-admin' }, env.jwtSecret, { expiresIn: '5m' })
    const request = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, ...await response.json() }
    }
    for (const [index, domain] of ['Frontend Developer', 'UI/UX Designer', 'Python Developer', 'AI & Machine Learning'].entries()) {
      const meetingUrl = `https://example.test/session/${index}`
      await InternshipDomain.create({ name: domain, liveClassEnabled: true, meetingUrl })
      const student = await Student.create({ fullName: 'Test Learner', email: `student-${index}@example.test`, phone: '+919876543210', college: 'Test College', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: domain, passwordHash: 'unused-test-hash' })
      const application = await InternshipApplication.create({ name: student.fullName, email: student.email, domain })
      const rawToken = randomBytes(32).toString('hex')
      await StudentSession.create({ student: student._id, tokenHash: hashToken(rawToken), authVersion: 0, expiresAt: new Date(Date.now() + 600000) })
      const cookie = `${studentCookieName()}=${rawToken}`
      const dashboard = async () => (await request('/student/dashboard', 'GET', undefined, cookie)).data
      assert.equal((await dashboard()).liveClassUrl, null)
      assert.equal(await studentHasDomainAccess(student), false)
      const decide = decision => request(`/admin/internships/${application._id}/decision`, 'PATCH', { decision })
      if (index === 3) {
        assert.equal((await decide('Rejected')).status, 200)
        assert.equal((await InternshipApplication.findById(application._id)).status, 'Rejected')
        assert.equal((await dashboard()).liveClassUrl, null)
        assert.equal(await studentHasDomainAccess(student), false)
        assert.equal((await decide('Approved')).status, 409)
        // A separate pending request can subsequently be approved.
        const replacement = await InternshipApplication.create({ name: student.fullName, email: student.email, domain })
        assert.equal((await request(`/admin/internships/${replacement._id}/decision`, 'PATCH', { decision: 'Approved' })).status, 200)
      } else {
        for (let attempt = 0; attempt < 2; attempt++) assert.equal((await decide('Approved')).status, 200)
        assert.equal((await InternshipApplication.findById(application._id)).status, 'Approved')
      }
      assert.equal((await dashboard()).liveClassUrl, meetingUrl)
      assert.equal((await dashboard()).internshipStatus, 'Approved')
      assert.equal(await studentHasDomainAccess(student), true)
      assert.equal(await BatchEnrollment.countDocuments({ student: student._id }), 0)
      if (index === 0) {
        const batch = await InternshipBatch.create({ name: 'Separate Batch', domain, code: 'TEST-BATCH', mentor: 'Test Mentor', maxStudents: 3, status: 'Active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) })
        const assign = () => request(`/admin/learning/batches/${batch._id}/students`, 'POST', { studentId: student.studentId, applicationId: String(application._id) })
        assert.equal((await assign()).status, 201)
        assert.equal((await assign()).status, 409)
        assert.equal((await decide('Approved')).status, 200)
        assert.equal(await BatchEnrollment.countDocuments({ student: student._id }), 1)
      }
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  }
})
