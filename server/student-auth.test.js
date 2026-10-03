import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from './config/env.js'
import { createStudentRouter } from './routes/student.js'
import { Student, StudentSession } from './models/student.js'
import { InternshipBatch, BatchEnrollment, initializeLearningModels } from './models/learning.js'
import { hashToken, studentCookieOptions, studentCookieName } from './middleware/student-auth.js'
import { contentVideoPublicRoutes } from './routes/content-videos.js'
import adminRoutes from './routes/admin.js'
import { liveClasses } from '../src/data.js'
import { passwordError } from '../shared/student.js'

test('new student passwords enforce composition, weak-pattern protection and confirmation', () => {
  for (const password of ['Manoj@2026', 'Innovix#26A', 'Learn@Code9', 'Student#84X', 'Build&Grow26A', 'R8!mV2#z', 'R8!mV2#z'.repeat(9)]) {
    assert.equal(passwordError(password, password), '', `Should accept ${password}`)
    assert.equal(passwordError(password, `${password}x`), 'Passwords do not match.')
  }
  for (const password of ['12345678', '123456789', '87654321', 'abcdefgh', 'qwerty123', 'password', 'password123', 'Password123', 'student123', 'innovix123', '11111111', '00000000', 'aaaaaaaa', 'abc12345', 'Password123!', 'P@ssw0rd123!', 'Student123!', 'Innovix2026!', 'Qwerty123!', 'Abcdef1!', 'A12345678!', 'A87654321!', 'Aa111111!', 'AbAbAbAb1!', 'Qazwsx1!', 'LearnCode9', 'learn@code9', 'LEARN@CODE9', 'Learn@Code', 'Aa1!xyz', 'R8!mV2#z'.repeat(9) + 'a', '', null, 12345678]) {
    assert.ok(passwordError(password, password), `Should reject ${password}`)
  }
})

test('student registration, login, sessions, CSRF, reset, domain access and admin separation', async () => {
  const dbName = `ist_${randomUUID().replaceAll('-', '')}`
  let server
  let capturedToken
  const emails = []
  try {
    assert.ok(env.mongoUri && env.jwtSecret, 'MongoDB and JWT configuration required')
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await initializeLearningModels()
    await Promise.all([Student.init(), StudentSession.init()])
    const app = express()
    app.use(cors({ origin: env.clientUrl, credentials: true }))
    app.use(express.json())
    app.use('/api/student', createStudentRouter({ emailConfigured: () => true, sendResetEmail: async (email, token) => { emails.push(email); capturedToken = token } }))
    app.use('/api/no-email', createStudentRouter({ emailConfigured: () => false }))
    app.use('/api/failed-email', createStudentRouter({ emailConfigured: () => true, sendResetEmail: async () => { throw new Error('Test delivery failure') } }))
    app.use('/api/content-creation/videos', contentVideoPublicRoutes)
    app.use('/api/admin', adminRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api`
    const request = async (route, method = 'GET', body, headers = {}) => {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: new URL(env.clientUrl).origin, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const result = await response.json()
      assert.ok(!JSON.stringify(result).includes('passwordHash'), 'Password hashes must never be returned')
      assert.ok(!JSON.stringify(result).includes('resetTokenHash'), 'Reset hashes must never be returned')
      return { status: response.status, cookie: response.headers.get('set-cookie'), ...result }
    }
    const password = 'Manoj@2026'
    const fixture = { fullName: 'Test Learner', email: 'student-auth-test@example.invalid', phoneCountry: 'IN', phone: '9876543210', college: 'Test College', course: 'Computer Science', yearOfStudy: '3rd Year', internshipDomain: 'Content Creation', password, confirmPassword: password }
    for (const changes of [{ password: '1234567', confirmPassword: '1234567' }, { password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) }, { password: 'Password123!', confirmPassword: 'Password123!' }, { confirmPassword: 'different' }, { phone: '123' }, { email: 'invalid' }, { college: '' }, { internshipDomain: 'Unknown' }]) {
      assert.equal((await request('/student/register', 'POST', { ...fixture, ...changes })).status, 400)
    }
    const created = await request('/student/register', 'POST', { ...fixture, accountStatus: 'suspended', authVersion: 100, studentId: 'attacker', role: 'admin' })
    assert.equal(created.status, 201)
    assert.equal(created.data.student.accountStatus, 'active')
    assert.match(created.data.student.studentId, /^INX-[A-F0-9]{16}$/)
    assert.equal(created.data.student.phone, '+919876543210')
    assert.equal(created.cookie, null, 'Registration must lead to login, not a fake authenticated state')
    const record = await Student.findOne({ email: fixture.email }).select('+passwordHash')
    assert.notEqual(record.passwordHash, password)
    assert.ok(await bcrypt.compare(password, record.passwordHash))
    assert.equal((await Student.findById(record._id)).passwordHash, undefined)
    assert.equal(record.toJSON().passwordHash, undefined)
    assert.equal((await request('/student/register', 'POST', { ...fixture, email: fixture.email.toUpperCase() })).status, 409)
    assert.equal((await request('/student/me')).status, 401)
    assert.equal((await request('/student/dashboard')).status, 401)
    assert.equal((await request('/content-creation/videos')).status, 401)
    const wrong = await request('/student/login', 'POST', { email: fixture.email, password: 'Incorrect123!' })
    const missing = await request('/student/login', 'POST', { email: 'unknown@example.invalid', password })
    assert.equal(wrong.status, 401); assert.equal(wrong.message, missing.message)
    assert.equal((await request('/student/login', 'POST', { email: fixture.email, password }, { Origin: 'https://attacker.invalid' })).status, 403)
    const loggedIn = await request('/student/login', 'POST', { email: ` ${fixture.email.toUpperCase()} `, password, rememberMe: false })
    assert.equal(loggedIn.status, 200)
    assert.match(loggedIn.cookie, /HttpOnly/i)
    assert.match(loggedIn.cookie, /SameSite=Lax/i)
    assert.ok(!/Max-Age|Expires/i.test(loggedIn.cookie))
    const cookie = loggedIn.cookie.split(';')[0]
    const rawToken = cookie.split('=')[1]
    const session = await StudentSession.findOne({ tokenHash: hashToken(rawToken) }).lean()
    assert.ok(session); assert.notEqual(session.tokenHash, rawToken)
    const headers = { Cookie: cookie }
    // Browser refresh restores state using only the HttpOnly cookie.
    const restored = await request('/student/me', 'GET', undefined, headers)
    assert.equal(restored.data.student.studentId, created.data.student.studentId)
    assert.equal(restored.data.csrfToken, loggedIn.data.csrfToken)
    const unapprovedDashboard = (await request('/student/dashboard', 'GET', undefined, headers)).data
    assert.equal(unapprovedDashboard.liveClassUrl, null, 'A registered account has no live-class access before enrollment')
    assert.equal(unapprovedDashboard.recordedClassesAvailable, false)
    const batch = await InternshipBatch.create({ name: 'Approved Content Batch', domain: fixture.internshipDomain, code: 'AUTH-APPROVED', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000), mentor: 'Test Mentor', maxStudents: 5, status: 'Active', enabled: true })
    await BatchEnrollment.create({ student: record._id, batch: batch._id })
    const dashboard = (await request('/student/dashboard', 'GET', undefined, headers)).data
    assert.equal(dashboard.liveClassUrl, liveClasses.find((item) => item.name === 'Content Creation').meetLink)
    assert.equal(dashboard.recordedClassesAvailable, true)
    assert.equal((await request('/content-creation/videos', 'GET', undefined, headers)).status, 200)
    assert.equal((await request('/admin/projects', 'GET', undefined, headers)).status, 401)
    assert.equal((await request('/admin/projects', 'GET', undefined, { Authorization: `Bearer ${rawToken}` })).status, 401)
    const adminToken = jwt.sign({ role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })
    assert.equal((await request('/admin/projects', 'GET', undefined, { Authorization: `Bearer ${adminToken}` })).status, 200)
    assert.equal((await request('/student/me', 'GET', undefined, { Authorization: `Bearer ${adminToken}` })).status, 401)
    assert.equal((await request('/student/logout', 'POST', {}, headers)).status, 403)
    assert.equal((await request('/student/logout', 'POST', {}, { ...headers, 'X-CSRF-Token': 'x'.repeat(64) })).status, 403)
    assert.equal((await request('/student/logout', 'POST', {}, { ...headers, 'X-CSRF-Token': loggedIn.data.csrfToken })).status, 200)
    assert.equal((await request('/student/me', 'GET', undefined, headers)).status, 401)
    assert.equal((await request('/student/dashboard', 'GET', undefined, headers)).status, 401)
    assert.equal((await request('/content-creation/videos', 'GET', undefined, headers)).status, 401)
    assert.equal(await StudentSession.countDocuments({ tokenHash: hashToken(rawToken) }), 0)
    const remembered = await request('/student/login', 'POST', { email: fixture.email, password, rememberMe: true })
    assert.match(remembered.cookie, /Max-Age=2592000/)
    const rememberHeaders = { Cookie: remembered.cookie.split(';')[0] }
    assert.equal((await request('/student/me', 'GET', undefined, rememberHeaders)).status, 200)
    await Student.updateOne({ _id: record._id }, { $set: { accountStatus: 'suspended' } })
    assert.equal((await request('/student/me', 'GET', undefined, rememberHeaders)).status, 401)
    assert.equal((await request('/student/login', 'POST', { email: fixture.email, password })).message, wrong.message)
    await Student.updateOne({ _id: record._id }, { $set: { accountStatus: 'active' } })
    await StudentSession.updateMany({ student: record._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    assert.equal((await request('/student/me', 'GET', undefined, rememberHeaders)).status, 401)
    const analyticsPassword = 'é'.repeat(72)
    // Existing legacy account: the new-password policy must never run during login.
    const legacyHash = await bcrypt.hash(analyticsPassword, 12)
    const analytics = await Student.create({ fullName: 'Existing Student', email: 'analytics-test@example.invalid', phone: '+919876543210', college: 'Test College', course: 'Analytics', yearOfStudy: '3rd Year', internshipDomain: 'Data Analytics', passwordHash: legacyHash })
    const analyticsLogin = await request('/student/login', 'POST', { email: 'analytics-test@example.invalid', password: analyticsPassword })
    assert.equal(analyticsLogin.status, 200)
    assert.equal((await Student.findById(analytics._id).select('+passwordHash')).passwordHash, legacyHash)
    const analyticsHeaders = { Cookie: analyticsLogin.cookie.split(';')[0] }
    assert.equal((await request('/content-creation/videos', 'GET', undefined, analyticsHeaders)).status, 403)
    const analyticsDashboard = (await request('/student/dashboard', 'GET', undefined, analyticsHeaders)).data
    assert.equal(analyticsDashboard.liveClassUrl, null, 'An existing account without an approved enrollment cannot access a live class')
    assert.equal(analyticsDashboard.recordedClassesAvailable, false)
    assert.equal((await request('/no-email/forgot-password', 'POST', { email: fixture.email })).status, 503)
    assert.equal((await request('/failed-email/forgot-password', 'POST', { email: fixture.email })).status, 503)
    assert.equal((await Student.findById(record._id).select('+resetTokenHash')).resetTokenHash, undefined)
    const resetRequest = await request('/student/forgot-password', 'POST', { email: fixture.email })
    assert.equal(resetRequest.status, 200)
    assert.equal((await request('/student/forgot-password', 'POST', { email: 'notfound@example.invalid' })).data.message, resetRequest.data.message)
    assert.ok(!JSON.stringify(resetRequest).includes(capturedToken))
    assert.deepEqual(emails, [fixture.email])
    const resetRecord = await Student.findById(record._id).select('+resetTokenHash +resetExpiresAt')
    assert.equal(resetRecord.resetTokenHash, hashToken(capturedToken))
    assert.ok(resetRecord.resetExpiresAt > new Date())
    const beforeReset = await request('/student/login', 'POST', { email: fixture.email, password })
    const newPassword = 'Learn@Code9'
    const resetBody = { token: capturedToken, password: newPassword, confirmPassword: newPassword }
    for (const changes of [{ password: '1234567', confirmPassword: '1234567' }, { password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) }, { password: '12345678', confirmPassword: '12345678' }, { password: 'Password123!', confirmPassword: 'Password123!' }, { confirmPassword: 'different' }]) {
      assert.equal((await request('/student/reset-password', 'POST', { ...resetBody, ...changes })).status, 400)
    }
    const reset = await request('/student/reset-password', 'POST', resetBody)
    assert.equal(reset.status, 200)
    assert.equal((await request('/student/reset-password', 'POST', resetBody)).status, 400)
    assert.equal((await request('/student/me', 'GET', undefined, { Cookie: beforeReset.cookie.split(';')[0] })).status, 401)
    assert.equal((await request('/student/login', 'POST', { email: fixture.email, password })).status, 401)
    assert.equal((await request('/student/login', 'POST', { email: fixture.email, password: newPassword })).status, 200)
    await request('/student/forgot-password', 'POST', { email: fixture.email })
    await Student.updateOne({ _id: record._id }, { $set: { resetExpiresAt: new Date(Date.now() - 1000) } })
    assert.equal((await request('/student/reset-password', 'POST', { ...resetBody, token: capturedToken })).status, 400)
    let throttled
    for (let attempt = 0; attempt < 21; attempt++) {
      throttled = await request('/student/login', 'POST', { email: 'invalid', password })
      if (throttled.status === 429) break
    }
    assert.equal(throttled.status, 429)
    const previousSameSite = process.env.STUDENT_COOKIE_SAME_SITE
    process.env.STUDENT_COOKIE_SAME_SITE = 'none'
    assert.equal(studentCookieOptions().secure, true)
    assert.equal(studentCookieName(), '__Host-innovix_student')
    if (previousSameSite === undefined) delete process.env.STUDENT_COOKIE_SAME_SITE; else process.env.STUDENT_COOKIE_SAME_SITE = previousSameSite
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() }
    finally { await mongoose.disconnect() }
  }
})
