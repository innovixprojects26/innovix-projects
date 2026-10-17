import { test } from 'node:test'

import assert from 'node:assert/strict'

import { createHmac, randomUUID } from 'node:crypto'

import express from 'express'

import mongoose from 'mongoose'

import { env } from './config/env.js'

import { createStudentRouter } from './routes/student.js'

import { learningStudentRoutes } from './routes/learning.js'

import { contentVideoPublicRoutes } from './routes/content-videos.js'

import { Student } from './models/student.js'

import { InternshipApplication } from './models/index.js'

import { InternshipDomain, ensureDomains } from './models/management.js'

import { ContentVideo } from './models/content-video.js'

import { BatchEnrollment, InternshipBatch, InternshipTask, initializeLearningModels } from './models/learning.js'

import { learningError, studentHasDomainAccess } from './services/learning-access.js'

import { publicConfiguration } from './controllers/management.js'



test('authenticated TEST payment unlocks only eligible learning without application approval', async () => {

  const dbName = `ipa_${randomUUID().replaceAll('-', '')}`

  const realFetch = globalThis.fetch

  let server, captured = false, refunded = 0, creates = 0

  process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture'

  process.env.RAZORPAY_KEY_SECRET = 'synthetic-access-secret'

  globalThis.fetch = async (url, options) => {

    if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options)

    if (String(url).endsWith('/orders')) { creates++; return Response.json({ id: 'order_access', amount: 49900, currency: 'INR' }) }

    return Response.json({ id: 'pay_access', order_id: 'order_access', amount: 49900, currency: 'INR', status: captured ? 'captured' : 'failed', captured, amount_refunded: refunded })

  }

  try {

    await mongoose.connect('mongodb://127.0.0.1:27017', { dbName })

    await initializeLearningModels(); await ensureDomains()

    await InternshipDomain.updateOne({ name: 'Python Developer' }, { $set: { recordedClassesEnabled: true, classActive: true, liveClassEnabled: true, meetingUrl: 'https://example.invalid/class' } })

    const app = express(); app.use(express.json())

    app.use('/student/learning', learningStudentRoutes); app.use('/student', createStudentRouter())

    app.use('/videos', contentVideoPublicRoutes); app.get('/configuration', publicConfiguration); app.use(learningError)

    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))

    const call = async (path, body, headers = {}) => {

      const response = await realFetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { Origin: new URL(env.clientUrl).origin, 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })

      return { status: response.status, ...(await response.json()), cookies: response.headers.getSetCookie() }

    }

    const fixture = { fullName: 'Access Test', email: 'paid-access@example.invalid', phoneCountry: 'IN', phone: '9876543210', college: 'Test', course: 'Test', yearOfStudy: 'Final Year', internshipDomain: 'Python Developer', password: 'Learn@Code9', confirmPassword: 'Learn@Code9' }

    assert.equal((await call('/student/register', fixture)).status, 201)

    const login = await call('/student/login', { email: fixture.email, password: fixture.password })

    const headers = { Cookie: login.cookies.find(x => x.startsWith('innovix_student=')).split(';')[0], 'X-CSRF-Token': login.data.csrfToken }

    const request = (path, body) => call(path, body, headers)

    const student = await Student.findOne({ email: fixture.email })

    const protectedPaths = ['/student/learning/progress', '/student/learning/tasks', '/student/learning/gamification', '/student/learning/leaderboard', '/videos']

    for (const path of protectedPaths) assert.equal((await call(path)).status, 401, path)

    assert.equal((await request('/student/learning/enroll', { domain: fixture.internshipDomain })).status, 200)

    const enrollment = await BatchEnrollment.findOne({ student: student._id })

    const batch = await InternshipBatch.findById(enrollment.batch)

    assert.equal(enrollment.paymentStatus, 'NOT_PAID')

    assert.equal(enrollment.learningAccessStatus, 'LOCKED')

    const video = await ContentVideo.create({ domain: fixture.internshipDomain, title: 'Lesson', module: 'Module', description: 'Test', publishDate: new Date(0), status: 'published', duration: 60, videoUrl: 'https://example.invalid/lesson.mp4' })

    const otherVideo = await ContentVideo.create({ domain: 'Data Analytics', title: 'Other lesson', module: 'Module', description: 'Test', publishDate: new Date(0), status: 'published', duration: 60, videoUrl: 'https://example.invalid/other.mp4' })

    const task = await InternshipTask.create({ title: 'Required task', description: 'Test', domain: fixture.internshipDomain, scope: 'Batch', batch: batch._id, assignedDate: new Date(0), dueDate: new Date(Date.now() + 86400000), status: 'Published' })

    for (const path of protectedPaths) assert.equal((await request(path)).status, 403, path)

    assert.equal((await request(`/student/learning/videos/${video._id}/progress`, { position: 0 })).status, 403)

    assert.equal((await request('/student/dashboard')).data.liveClassUrl, null)

    assert.equal((await call('/student/learning/payments/test/order', {}, { Cookie: headers.Cookie })).status, 403, 'CSRF required')

    assert.equal((await call('/student/learning/payments/test/order', {}, { ...headers, Origin: 'https://evil.invalid' })).status, 403)

    const order = await request('/student/learning/payments/test/order', {})

    assert.equal(order.status, 200); assert.equal(order.data.amount, 49900)

    assert.equal((await request('/student/learning/payments/test/order', {})).data.orderId, order.data.orderId, 'Cancellation/retry reuses the pending order')

    assert.equal(creates, 1)

    const details = { razorpay_order_id: 'order_access', razorpay_payment_id: 'pay_access', razorpay_signature: createHmac('sha256', 'synthetic-access-secret').update('order_access|pay_access').digest('hex') }

    assert.equal((await request('/student/learning/payments/test/verify', details)).status, 409, 'Failed payment cannot unlock')

    assert.equal(await studentHasDomainAccess(student), false)

    captured = true; refunded = 1

    assert.equal((await request('/student/learning/payments/test/verify', details)).status, 409, 'Refunded payment cannot unlock')

    refunded = 0

    assert.equal((await request('/student/learning/payments/test/verify', details)).status, 200)

    assert.equal((await request('/student/learning/payments/test/verify', details)).status, 200, 'Verification retry is idempotent')

    assert.equal(await InternshipApplication.countDocuments(), 0, 'No application or Admin approval was created')

    const dashboard = (await request('/student/dashboard')).data

    assert.equal(dashboard.hasDomainAccess, true); assert.equal(dashboard.paymentVerified, true)

    assert.equal(dashboard.recordedClassesAvailable, true); assert.equal(dashboard.liveClassUrl, 'https://example.invalid/class')

    assert.equal((await request('/student/learning/progress')).status, 200)

    const videos = await request('/videos'); assert.equal(videos.status, 200); assert.equal(videos.data.length, 1)

    assert.equal((await request(`/student/learning/videos/${otherVideo._id}/progress`, { position: 0 })).status, 404)

    assert.equal((await request(`/student/learning/tasks/${task._id}/submit`, { text: 'Skip videos' })).status, 403, 'Paid students still cannot skip completion stages')

    assert.equal((await request('/student/learning/progress')).data.certificates.length, 0)

    for (const changes of [{ classActive: false }, { classActive: true, meetingUrl: 'javascript:alert(1)' }, { liveClassEnabled: false }]) {

      await InternshipDomain.updateOne({ name: fixture.internshipDomain }, { $set: changes })

      assert.equal((await request('/student/dashboard')).data.liveClassUrl, null)

    }

    await InternshipDomain.updateOne({ name: fixture.internshipDomain }, { $set: { recordedClassesEnabled: false } })

    assert.equal((await request('/videos')).status, 403)

    await InternshipBatch.updateOne({ _id: batch._id }, { $set: { enabled: false } })

    const unavailable = (await request('/student/dashboard')).data

    assert.equal(unavailable.paymentVerified, true); assert.equal(unavailable.hasDomainAccess, false)

    assert.match(unavailable.internshipStatus, /access unavailable/)

    for (const domain of (await InternshipDomain.find().lean()).map(x => x.name)) {

      await Student.updateOne({ _id: student._id }, { $set: { internshipDomain: domain } })

      await InternshipBatch.updateOne({ _id: batch._id }, { $set: { domain, enabled: true } })

      const current = await Student.findById(student._id)

      assert.equal(await studentHasDomainAccess(current), domain !== 'AI Tools', domain)

    }

    await Student.updateOne({ _id: student._id }, { $set: { internshipDomain: 'AI Tools' } })

    await InternshipBatch.updateOne({ _id: batch._id }, { $set: { domain: 'AI Tools' } })

    assert.equal((await request('/student/learning/payments/test/order', {})).status, 403)

    assert.equal((await request('/videos')).status, 403)

    const config = await call('/configuration')

    assert.ok(config.data.domains.every(x => x.meetingUrl === ''), 'Public API never leaks meeting URLs')

    const saved = await BatchEnrollment.findById(enrollment._id)

    assert.equal(saved.paymentStatus, 'PAID'); assert.equal(saved.paymentMode, 'test'); assert.equal(saved.learningAccessStatus, 'UNLOCKED')

    process.env.RAZORPAY_KEY_ID = 'rzp_live_fixture'

    assert.equal((await request('/student/learning/payments/test/order', {})).status, 503)

  } finally {

    globalThis.fetch = realFetch

    if (server) await new Promise(resolve => server.close(resolve))

    if (mongoose.connection.name === dbName && dbName.startsWith('ipa_')) await mongoose.connection.dropDatabase()

    await mongoose.disconnect()

  }

})
