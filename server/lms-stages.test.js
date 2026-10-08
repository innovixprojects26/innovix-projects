import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { env } from './config/env.js'
import { studentDomains } from '../shared/student.js'
import { Student, StudentSession } from './models/student.js'
import { InternshipApplication } from './models/index.js'
import { InternshipDomain, ensureDomains } from './models/management.js'
import { ContentVideo } from './models/content-video.js'
import { InternshipBatch, BatchEnrollment, InternshipTask, TaskSubmission, VideoProgress, Certificate, initializeLearningModels } from './models/learning.js'
import { csrfFor, hashToken, studentCookieName } from './middleware/student-auth.js'
import adminRoutes from './routes/admin.js'

test('nine-domain LMS: prices, disabled gateway, secure recordings, strict stages, review, files and certificate preservation', async () => {
  const dbName = `lms_${randomUUID().replaceAll('-', '')}`
  const directory = await mkdtemp(path.join(os.tmpdir(), 'innovix-lms-'))
  process.env.LEARNING_STORAGE_DIR = directory
  process.env.CONTENT_VIDEO_STORAGE_DIR = directory
  const { learningStudentRoutes, learningAdminRoutes, certificatePublicRoutes } = await import('./routes/learning.js')
  const { contentVideoAdminRoutes, contentVideoPublicRoutes } = await import('./routes/content-videos.js')
  let server
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 10000 })
    await Promise.all([initializeLearningModels(), Student.init(), StudentSession.init(), ContentVideo.init()])
    await ensureDomains()
    const app = express(); app.use(express.json())
    app.use('/admin/learning', learningAdminRoutes); app.use('/student/learning', learningStudentRoutes)
    app.use('/admin/videos', contentVideoAdminRoutes); app.use('/videos', contentVideoPublicRoutes)
    app.use('/admin', adminRoutes); app.use('/verify', certificatePublicRoutes)
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }))
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const adminHeaders = { Authorization: `Bearer ${jwt.sign({ role: 'admin' }, env.jwtSecret, { expiresIn: '10m' })}` }
    const call = async (url, method = 'GET', body, headers = adminHeaders) => {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Origin: new URL(env.clientUrl).origin, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, ...await response.json() }
    }
    const day = n => new Date(Date.now() + n * 86400000).toISOString()
    const domains = (await call('/admin/internship-domains')).data
    assert.equal(domains.length, 9)
    assert.ok(domains.every(item => item.price === 499))
    assert.ok(domains.some(item => item.name === 'AI Tools'))
    assert.equal((await call('/admin/configuration')).data.settings.internshipPaymentsEnabled, false)
    assert.equal((await call('/admin/learning/payments', 'GET', undefined, {})).status, 401, 'Payment records require admin authentication')
    assert.equal((await call(`/admin/internship-domains/${domains[0]._id}`, 'PATCH', { price: 799.99 })).status, 200)
    assert.equal((await call(`/admin/internship-domains/${domains[1]._id}`, 'PATCH', { price: -1 })).status, 400)
    await ensureDomains()
    assert.equal((await InternshipDomain.findById(domains[0]._id)).price, 799.99, 'Initialization preserves Admin edits')
    assert.equal(await InternshipDomain.countDocuments({ price: 499 }), 8)
    const videos = []
    const mp4 = Buffer.alloc(256); mp4.writeUInt32BE(24, 0); mp4.write('ftypisom', 4)
    for (const domain of studentDomains) {
      const track = domains.find(item => item.name === domain)
      await call(`/admin/internship-domains/${track._id}`, 'PATCH', { recordedClassesEnabled: true })
      const created = await call('/admin/videos', 'POST', { domain, title: `${domain} lesson`, module: 'Introduction', description: 'Required lesson', publishDate: day(-10), duration: 10, required: true, status: 'draft' })
      assert.equal(created.status, 201, JSON.stringify(created))
      const upload = await fetch(`${base}/admin/videos/${created.data._id}/upload/video`, { method: 'PUT', headers: { ...adminHeaders, 'Content-Type': 'application/octet-stream', 'X-File-Extension': 'mp4' }, body: mp4 })
      assert.equal(upload.status, 200); await upload.json()
      assert.equal((await call(`/admin/videos/${created.data._id}`, 'PATCH', { status: 'published' })).status, 200)
      assert.equal((await call('/admin/videos/reorder', 'PUT', { domain, ids: [created.data._id] })).status, 200)
      videos.push(created.data)
    }
    const video = videos.find(item => item.domain === 'Python Developer')
    const secondCreated = await call('/admin/videos', 'POST', { domain: video.domain, title: 'Second lesson', module: 'Practice', description: 'Required follow-up', publishDate: day(-10), duration: 10, required: true, videoUrl: 'https://cdn.example.test/second.mp4', status: 'draft' })
    assert.equal((await call(`/admin/videos/${secondCreated.data._id}`, 'PATCH', { status: 'published' })).status, 200)
    const secondVideo = secondCreated.data
    const learner = await Student.create({ fullName: 'LMS Learner', email: 'lms@example.test', phone: '+919876543210', college: 'Test', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: video.domain, passwordHash: 'test-only-not-a-login-hash' })
    const token = randomBytes(32).toString('hex')
    await StudentSession.create({ student: learner._id, tokenHash: hashToken(token), authVersion: 0, expiresAt: new Date(Date.now() + 3600000) })
    const headers = { Cookie: `${studentCookieName()}=${token}`, 'X-CSRF-Token': csrfFor(token) }
    const student = (url, method, body) => call('/student/learning' + url, method, body, headers)
    assert.equal((await student(`/videos/${video._id}/progress`, 'POST', { position: 0 })).status, 403, 'Unapproved students cannot earn playback credit')
    await InternshipApplication.create({ name: learner.fullName, email: learner.email, domain: video.domain, status: 'Approved' })
    assert.equal((await student(`/videos/${video._id}/progress`, 'POST', { position: 0 })).status, 200, 'Direct Admin approval enables learning without a paid enrollment')
    assert.equal((await student(`/videos/${secondVideo._id}/progress`, 'POST', { position: 0 })).status, 403, 'Later lessons stay locked until earlier lessons are complete')
    const sequence = await call('/videos', 'GET', undefined, headers)
    assert.equal(sequence.data.find(item => item._id === String(secondVideo._id)).locked, true)
    const lockedMedia = await fetch(`${base}/videos/${secondVideo._id}/media/video`, { headers })
    assert.equal(lockedMedia.status, 403, 'Media API enforces lesson order')
    const batch = await InternshipBatch.create({ name: 'Python cohort', domain: video.domain, code: 'LMS-PY', startDate: day(-12), endDate: day(-1), mentor: 'Mentor', maxStudents: 10, status: 'Active', enabled: true })
    const enrollment = await BatchEnrollment.create({ student: learner._id, batch: batch._id })
    const paymentRecords = (await call('/admin/learning/payments')).data
    assert.equal(paymentRecords.internships.length, 1)
    assert.equal(paymentRecords.internships[0].status, 'Not Paid')
    assert.deepEqual(paymentRecords.projects, [])
    const taskBody = { title: 'Required task', description: 'Practice', domain: video.domain, scope: 'Batch', batch: String(batch._id), assignedDate: day(-8), dueDate: day(-2), required: true, status: 'Published', methods: ['text', 'file'] }
    const task = (await call('/admin/learning/tasks', 'POST', taskBody)).data
    const project = (await call('/admin/learning/tasks', 'POST', { ...taskBody, title: 'Final project', stage: 'Project' })).data
    assert.ok(task?._id && project?._id)
    const upload = async (taskId, who = headers) => {
      const response = await fetch(`${base}/student/learning/tasks/${taskId}/file`, { method: 'PUT', headers: { ...who, Origin: new URL(env.clientUrl).origin, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'project.txt' }, body: 'Original project submission' })
      return { status: response.status, ...await response.json() }
    }
    const progress = async () => (await student('/progress')).data
    assert.equal((await progress()).payment.status, 'Not Paid')
    for (const status of ['Pending', 'Paid', 'Not Paid']) {
      await BatchEnrollment.updateOne({ _id: enrollment._id }, { $set: { paymentStatus: status } })
      assert.equal((await progress()).payment.status, status, 'Display the stored payment status without changing it')
    }
    assert.equal((await progress()).payment.gatewayEnabled, false)
    await call('/admin/configuration/settings', 'PUT', { internshipPaymentsEnabled: true })
    assert.equal((await progress()).payment.gatewayEnabled, false, 'Feature switch cannot activate Razorpay')
    assert.equal((await progress()).payment.status, 'Not Paid')
    await call('/admin/configuration/settings', 'PUT', { internshipPaymentsEnabled: false })
    for (const item of [task, project]) {
      assert.equal((await student(`/tasks/${item._id}/submit`, 'POST', { text: 'Bypass', completed: true })).status, 403)
      assert.equal((await upload(item._id)).status, 403)
    }
    assert.equal((await student('/tasks')).data.length, 0)
    assert.equal((await progress()).upcoming.length, 0, 'Progress does not expose locked assignments')
    assert.equal((await student(`/videos/${video._id}/progress`, 'POST', { position: 0, completed: true })).data.completed, false)
    assert.equal((await student(`/videos/${video._id}/progress`, 'POST', { position: 10, completed: true })).data.completed, false)
    assert.equal((await progress()).stages.videosDone, false)
    assert.equal((await student(`/videos/${videos.find(item => item.domain !== video.domain)._id}/progress`, 'POST', { position: 0 })).status, 404)
    // Advance only this test fixture's server sample time; no real playback wait.
    await VideoProgress.updateOne({ student: learner._id, video: video._id }, { $set: { position: 0, sampledAt: new Date(Date.now() - 11000) } })
    assert.equal((await student(`/videos/${video._id}/progress`, 'POST', { position: 10 })).data.completed, true)
    assert.equal((await student(`/videos/${secondVideo._id}/progress`, 'POST', { position: 0 })).status, 200)
    await VideoProgress.updateOne({ student: learner._id, video: secondVideo._id }, { $set: { position: 0, sampledAt: new Date(Date.now() - 11000) } })
    assert.equal((await student(`/videos/${secondVideo._id}/progress`, 'POST', { position: 10 })).data.completed, true)
    assert.ok((await call('/videos', 'GET', undefined, headers)).data.find(item => item._id === String(video._id)).completed)
    assert.equal((await student('/tasks')).data.length, 1)
    assert.equal((await progress()).stages.videosDone, true)
    assert.equal((await upload(project._id)).status, 403)
    const submitted = await student(`/tasks/${task._id}/submit`, 'POST', { text: 'My task' })
    assert.equal(submitted.status, 201)
    assert.equal((await progress()).stages.tasksDone, false, 'Submitting does not unlock projects')
    assert.equal((await student(`/tasks/${project._id}/submit`, 'POST', { text: 'Bypass' })).status, 403)
    const review = (submission, status) => call(`/admin/learning/submissions/${submission._id}`, 'PATCH', { version: submission.version, status, feedback: status === 'Resubmit' ? 'Revise the work' : '' })
    await review(submitted.data, 'Approved')
    assert.equal((await progress()).stages.tasksDone, true)
    assert.equal((await student('/tasks')).data.length, 2)
    assert.equal((await student(`/tasks/${project._id}/submit`, 'POST', { text: 'No file' })).status, 400)
    const file = await upload(project._id); assert.equal(file.status, 201)
    const projectSubmission = await student(`/tasks/${project._id}/submit`, 'POST', { file: file.data._id })
    assert.equal(projectSubmission.status, 201)
    assert.equal((await progress()).stages.projectsDone, false)
    assert.equal((await call('/admin/learning/certificates', 'POST', { enrollment: String(enrollment._id), type: 'Internship Certificate' })).status, 409)
    const changes = await review(projectSubmission.data, 'Resubmit')
    assert.equal(changes.status, 200)
    const revision = await student(`/tasks/${project._id}/submit`, 'POST', { file: file.data._id })
    assert.equal(revision.status, 201)
    assert.equal((await review(revision.data, 'Approved')).status, 200)
    assert.equal((await progress()).stages.projectsDone, true)
    assert.equal(await Certificate.countDocuments(), 0, 'No automatic certificate issuance')
    assert.equal((await call(`/admin/learning/batches/${batch._id}`, 'PATCH', { status: 'Completed', requiredVideos: [video._id] })).status, 200)
    assert.equal((await call(`/admin/learning/eligibility/${enrollment._id}`)).data.eligible, true)
    const issued = await call('/admin/learning/certificates', 'POST', { enrollment: String(enrollment._id), type: 'Internship Certificate' })
    assert.equal(issued.status, 201, JSON.stringify(issued))
    assert.equal((await progress()).stages.steps[3].status, 'Completed')
    assert.equal((await call(`/verify/${issued.data.certificateId}`)).data.status, 'Active')
    assert.equal((await call(`/admin/learning/certificates/${issued.data._id}/revoke`, 'POST', {})).status, 200)
    assert.equal((await call(`/verify/${issued.data.certificateId}`)).data.status, 'Revoked')
    // Disabling visibility or adding no work must never create eligibility.
    await InternshipTask.updateOne({ _id: project._id }, { $set: { status: 'Draft' } })
    assert.equal((await call(`/admin/learning/eligibility/${enrollment._id}`)).data.eligible, false)
    assert.equal(await Student.countDocuments(), 1)
    assert.equal(await BatchEnrollment.countDocuments(), 1)
    assert.equal(await TaskSubmission.countDocuments(), 2)
    assert.equal((await TaskSubmission.findOne({ task: project._id })).revisions.length, 2)
    assert.equal(await VideoProgress.countDocuments(), 1)
    assert.equal(await Certificate.countDocuments(), 1, 'Revocation retains historical certificates')
    assert.equal((await BatchEnrollment.findById(enrollment._id)).paymentStatus, 'Not Paid')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'innovix-lms-')))
    await rm(directory, { recursive: true, force: true })
    delete process.env.LEARNING_STORAGE_DIR; delete process.env.CONTENT_VIDEO_STORAGE_DIR
  }
})
