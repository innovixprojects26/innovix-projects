import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import express from 'express'
import bcrypt from 'bcryptjs'
import { env } from './config/env.js'
import { Student, StudentSession } from './models/student.js'
import { Admin, Enquiry, InternshipApplication } from './models/index.js'
import { WebsiteConfig, InternshipDomain, ensureDomains } from './models/management.js'
import { InternshipBatch, BatchEnrollment, InternshipTask, TaskSubmission, Certificate, StudentNotification, LearningActivity, VideoProgress, LearningFile, initializeLearningModels } from './models/learning.js'
import { ContentVideo } from './models/content-video.js'
import { csrfFor, hashToken, studentCookieName } from './middleware/student-auth.js'
import adminRoutes from './routes/admin.js'
import { batchProgress, daysUntil } from '../shared/learning.js'
import { mergeRanges, achievements } from './controllers/learning-progress.js'

test('date progress, playback ranges and activity achievements use real bounded values', () => {
  assert.deepEqual(batchProgress({ startDate: '2026-01-01', endDate: '2026-01-11' }, new Date('2026-01-06')), { daysCompleted: 5, daysRemaining: 5, totalDays: 10, percent: 50 })
  assert.equal(batchProgress({ startDate: '2026-01-01', endDate: '2026-01-11' }, new Date('2025-12-01')).percent, 0)
  assert.equal(batchProgress({ startDate: '2026-01-01', endDate: '2026-01-11' }, new Date('2026-02-01')).percent, 100)
  assert.equal(batchProgress({ status: 'Upcoming', startDate: '2026-01-01', endDate: '2026-01-11' }, new Date('2026-01-06')).percent, 0)
  assert.equal(daysUntil('2026-01-01T12:00:00Z', new Date('2026-01-01T13:00:00Z')), -1, 'Past-due work is overdue immediately')
  assert.deepEqual(mergeRanges([[0, 10], [5, 15], [20, 30], [22, 25]]), [[0, 15], [20, 30]])
  assert.deepEqual(achievements([]), { xp: 0, badges: [], streak: 0 })
  const events = Array.from({ length: 7 }, (_, i) => ({ type: 'learning-day', xp: 2, createdAt: new Date(`2026-01-0${i + 1}T12:00:00Z`) }))
  assert.equal(achievements(events, new Date('2026-01-07')).streak, 7)
  assert.ok(achievements(events, new Date('2026-01-07')).badges.includes('7-Day Learner'))
  assert.equal(achievements(events, new Date('2026-01-10')).streak, 0)
})

test('complete learning API workflows, isolated ownership, history, verification, analytics, leads and switches', async () => {
  const dbName = `learn_${randomUUID().replaceAll('-', '')}`
  const directory = await mkdtemp(path.join(os.tmpdir(), 'innovix-learning-'))
  process.env.LEARNING_STORAGE_DIR = directory
  const { learningStudentRoutes, learningAdminRoutes, certificatePublicRoutes } = await import('./routes/learning.js')
  const { validateLearningFile } = await import('./storage/learning-files.js')
  let server
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Promise.all([initializeLearningModels(), Student.init(), StudentSession.init(), Admin.init(), ContentVideo.init()])
    await ensureDomains()
    await InternshipDomain.updateOne({ name: 'Content Creation' }, { $set: { recordedClassesEnabled: true } })
    const password = 'Learn@Code9'
    await Admin.create({ email: 'admin@example.test', passwordHash: await bcrypt.hash(password, 4) })
    const app = express(); app.use(express.json())
    app.use('/api/admin/learning', learningAdminRoutes); app.use('/api/student/learning', learningStudentRoutes); app.use('/api/certificates/verify', certificatePublicRoutes); app.use('/api/admin', adminRoutes)
    app.use((error, _req, res, _next) => res.status(500).json({ success: false, message: error.message }))
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api`
    let adminToken
    const call = async (url, method = 'GET', body, headers = {}) => {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Origin: new URL(env.clientUrl).origin, ...(url.startsWith('/admin') && adminToken ? { Authorization: `Bearer ${adminToken}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, ...await response.json() }
    }
    const admin = (url, method, body) => call('/admin/learning' + url, method, body)
    assert.equal((await admin('/batches')).status, 401)
    assert.equal((await call('/student/learning/progress')).status, 401)
    adminToken = (await call('/admin/login', 'POST', { email: 'admin@example.test', password })).data.token
    assert.ok(adminToken)
    const fixtures = []
    for (const [index, domain] of ['Content Creation', 'Content Creation', 'Data Analytics'].entries()) {
      const student = await Student.create({ fullName: `Test Learner ${index}`, email: `learner${index}@example.test`, phone: '+919876543210', college: 'Test College', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: domain, passwordHash: await bcrypt.hash(password, 4) })
      const token = randomBytes(32).toString('hex')
      await StudentSession.create({ student: student._id, tokenHash: hashToken(token), authVersion: 0, expiresAt: new Date(Date.now() + 3600000) })
      fixtures.push({ student, headers: { Cookie: `${studentCookieName()}=${token}`, 'X-CSRF-Token': csrfFor(token) } })
    }
    const [a, b, outsider] = fixtures
    const studentCall = (who, url, method, body) => call('/student/learning' + url, method, body, who.headers)
    const days = n => new Date(Date.now() + n * 86400000).toISOString()
    const batchBody = { name: 'Content Creation October', domain: 'Content Creation', code: 'CC-TEST', startDate: days(-10), endDate: days(-1), mentor: 'Mentor', maxStudents: 1, applicationDeadline: days(-11), status: 'Active', enabled: true, requiredVideos: [] }
    const created = await admin('/batches', 'POST', batchBody); assert.equal(created.status, 200, JSON.stringify(created)); const batch = created.data
    assert.equal((await admin('/batches', 'POST', batchBody)).status, 409)
    const second = (await admin('/batches', 'POST', { ...batchBody, name: 'Second batch', code: 'CC-SECOND' })).data
    assert.equal((await admin(`/batches/${batch._id}/students`, 'POST', { studentId: outsider.student.studentId })).status, 400)
    const application = await InternshipApplication.create({ name: a.student.fullName, email: a.student.email, domain: 'Content Creation', status: 'Selected' })
    const assigned = await admin(`/batches/${batch._id}/students`, 'POST', { studentId: a.student.studentId, applicationId: String(application._id) })
    assert.equal(assigned.status, 201, JSON.stringify(assigned))
    assert.equal((await InternshipApplication.findById(application._id)).status, 'Joined')
    assert.equal((await admin(`/batches/${batch._id}/students`, 'POST', { studentId: b.student.studentId })).status, 409, 'Capacity is enforced')
    assert.equal((await studentCall(a, '/progress')).data.enrollment.batch.code, batch.code)
    assert.equal((await studentCall(b, '/progress')).data.enrollment, null)
    assert.equal((await admin(`/batches/${second._id}/students`, 'POST', { studentId: a.student.studentId })).status, 409)
    assert.equal((await admin(`/batches/${second._id}/students`, 'POST', { studentId: a.student.studentId, transfer: true })).status, 201)
    assert.equal((await BatchEnrollment.findById(assigned.data._id)).status, 'Transferred')
    assert.equal((await InternshipBatch.findById(batch._id)).enrollmentCount, 0)
    const back = await admin(`/batches/${batch._id}/students`, 'POST', { studentId: a.student.studentId, transfer: true })
    assert.equal(back.status, 201)
    const draft = (await admin('/batches', 'POST', { ...batchBody, code: 'CC-DRAFT', status: 'Draft' })).data
    assert.equal((await admin(`/batches/${draft._id}`, 'DELETE')).status, 200)
    assert.equal((await admin(`/batches/${batch._id}`, 'DELETE')).status, 409)

    const taskBody = { title: 'Create a short film', description: 'Show your storytelling skills.', instructions: 'Explain your approach.', domain: 'Content Creation', scope: 'Batch', batch: batch._id, assignedDate: days(-5), dueDate: days(-2), maximumMarks: 100, methods: ['text', 'github', 'demo', 'file'], required: true, status: 'Published' }
    const taskResult = await admin('/tasks', 'POST', taskBody); assert.equal(taskResult.status, 200, JSON.stringify(taskResult)); const task = taskResult.data
    assert.equal((await studentCall(a, '/tasks')).data.length, 1)
    assert.equal((await studentCall(b, '/tasks')).data.length, 0)
    assert.equal((await studentCall(outsider, '/tasks')).data.length, 0)
    assert.equal((await studentCall(b, `/tasks/${task._id}/submit`, 'POST', { text: 'Not mine' })).status, 404)
    assert.equal((await call(`/student/learning/tasks/${task._id}/submit`, 'POST', { text: 'CSRF test' }, { Cookie: a.headers.Cookie })).status, 403)
    assert.equal((await studentCall(a, `/tasks/${task._id}/submit`, 'POST', {})).status, 400)
    const personal = await admin('/tasks', 'POST', { ...taskBody, scope: 'Student', batch: undefined, student: String(a.student._id), required: false, title: 'Personal task', status: 'Draft' })
    assert.equal((await studentCall(a, '/tasks')).data.length, 1)
    await admin(`/tasks/${personal.data._id}`, 'PATCH', { status: 'Published' })
    assert.equal((await studentCall(a, '/tasks')).data.length, 2)
    assert.equal((await studentCall(b, '/tasks')).data.length, 0)
    const domain = await admin('/tasks', 'POST', { ...taskBody, title: 'Domain task', scope: 'Domain', batch: undefined, required: false })
    assert.equal((await studentCall(b, '/tasks')).data.length, 1)
    assert.equal((await studentCall(outsider, '/tasks')).data.length, 0)

    const upload = async (who, data, name, adminUpload = false) => {
      const r = await fetch(`${base}/${adminUpload ? 'admin' : 'student'}/learning/tasks/${task._id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), Origin: new URL(env.clientUrl).origin, ...(adminUpload ? { Authorization: `Bearer ${adminToken}` } : who.headers) }, body: data }); return { status: r.status, ...await r.json() }
    }
    assert.equal((await upload(b, 'Private', 'notes.txt')).status, 404)
    assert.equal((await upload(a, 'MZ executable', 'fake.pdf')).status, 400)
    assert.equal((await upload(a, 'notes', '../notes.txt')).status, 400)
    const file = await upload(a, 'My original research notes.', 'notes.txt'); assert.equal(file.status, 201, JSON.stringify(file)); assert.ok(!JSON.stringify(file).includes('filename'))
    const privateFile = await fetch(`${base}/student/learning/files/${file.data._id}`, { headers: b.headers }); assert.equal(privateFile.status, 404)
    const ownFile = await fetch(`${base}/student/learning/files/${file.data._id}`, { headers: a.headers }); assert.equal(ownFile.status, 200); assert.equal(await ownFile.text(), 'My original research notes.')
    assert.ok(ownFile.headers.get('content-disposition').startsWith('attachment'))
    const teacherFile = await upload(null, 'Reference material', 'reference.txt', true); assert.equal(teacherFile.status, 201)
    assert.equal((await studentCall(a, '/tasks')).data.find(item => item._id === task._id).attachment, teacherFile.data._id)
    assert.throws(() => validateLearningFile('test.exe', Buffer.from('MZ')))
    assert.throws(() => validateLearningFile('script.txt', Buffer.from('#!/bin/sh')))
    assert.throws(() => validateLearningFile('large.txt', Buffer.alloc(10 * 1024 * 1024 + 1, 'a')))
    assert.equal(validateLearningFile('safe.pdf', Buffer.from('%PDF-1.4\n%%EOF')).type, 'application/pdf')

    await call('/admin/configuration/settings', 'PUT', { gamificationEnabled: true, leaderboardEnabled: true })
    const submitted = await studentCall(a, `/tasks/${task._id}/submit`, 'POST', { text: 'First version', file: file.data._id, github: 'https://github.com/example/project' })
    assert.equal(submitted.status, 201, JSON.stringify(submitted)); assert.equal(submitted.data.revisions[0].late, true)
    assert.equal((await studentCall(a, `/tasks/${task._id}/submit`, 'POST', { text: 'Duplicate' })).status, 409)
    assert.equal((await admin(`/submissions/${submitted.data._id}`, 'PATCH', { version: 999, status: 'Approved', feedback: '' })).status, 409)
    assert.equal((await admin(`/submissions/${submitted.data._id}`, 'PATCH', { version: 1, status: 'Approved', feedback: '', marks: 101 })).status, 400)
    const review = await admin(`/submissions/${submitted.data._id}`, 'PATCH', { version: 1, status: 'Resubmit', feedback: 'Improve the conclusion.', marks: 60 }); assert.equal(review.status, 200)
    const newRevision = await studentCall(a, `/tasks/${task._id}/submit`, 'POST', { text: 'Improved conclusion.' }); assert.equal(newRevision.status, 201)
    assert.equal(newRevision.data.revisions.length, 2); assert.equal(newRevision.data.revisions[0].feedback, 'Improve the conclusion.')
    const approvedTask = await admin(`/submissions/${submitted.data._id}`, 'PATCH', { version: newRevision.data.version, status: 'Completed', feedback: 'Well done.', marks: 95 }); assert.equal(approvedTask.status, 200)
    assert.equal((await LearningActivity.find({ student: a.student._id, type: 'task-submitted' })).length, 1, 'Resubmissions do not farm XP')
    const progress = (await studentCall(a, '/progress')).data
    assert.equal(progress.tasksAssigned, 3); assert.equal(progress.tasksCompleted, 1); assert.equal(progress.eligibility.eligible, false)
    assert.equal((await studentCall(b, '/progress?student=' + a.student._id)).data.tasksCompleted, 0)
    assert.equal((await admin('/certificates', 'POST', { enrollment: back.data._id, type: 'Internship Certificate' })).status, 409)

    const video = await ContentVideo.create({ title: 'Test class', module: 'Intro', description: 'Learning', publishDate: days(-1), status: 'published', videoFile: 'test.mp4', duration: 10 })
    assert.equal((await studentCall(outsider, `/videos/${video._id}/progress`, 'POST', { position: 0 })).status, 404)
    assert.equal((await studentCall(a, `/videos/${video._id}/progress`, 'POST', { position: 0 })).status, 200)
    assert.equal((await studentCall(a, `/videos/${video._id}/progress`, 'POST', { position: 10 })).data.completed, false, 'Instant seeking is not completion')
    await VideoProgress.updateOne({ student: a.student._id, video: video._id }, { $set: { position: 0, sampledAt: new Date(Date.now() - 10000) } })
    assert.equal((await studentCall(a, `/videos/${video._id}/progress`, 'POST', { position: 10 })).data.completed, true)
    assert.equal((await studentCall(a, '/progress')).data.videosWatched, 1)
    assert.equal((await admin(`/batches/${batch._id}`, 'PATCH', { requiredVideos: [String(video._id)], status: 'Completed' })).status, 200)
    assert.equal((await BatchEnrollment.findById(back.data._id)).status, 'Completed')
    assert.equal((await admin(`/batches/${batch._id}/students/${back.data._id}`, 'DELETE')).status, 404)
    assert.equal((await admin(`/batches/${batch._id}`, 'PATCH', { name: 'Erase history' })).status, 409)
    const eligible = await admin(`/eligibility/${back.data._id}`); assert.equal(eligible.data.eligible, true, JSON.stringify(eligible))
    const cert = await admin('/certificates', 'POST', { enrollment: back.data._id, type: 'Internship Certificate' }); assert.equal(cert.status, 201, JSON.stringify(cert))
    const cert2 = await admin('/certificates', 'POST', { enrollment: back.data._id, type: 'Achievement Certificate' }); assert.equal(cert2.status, 201); assert.notEqual(cert.data.certificateId, cert2.data.certificateId)
    assert.match(cert.data.certificateId, /^INX-INT-\d{4}-[A-F\d]{16}$/)
    assert.equal((await admin('/certificates', 'POST', { enrollment: back.data._id, type: 'Internship Certificate' })).status, 409)
    const verification = await call(`/certificates/verify/${cert.data.certificateId}`); assert.equal(verification.status, 200); assert.equal(verification.data.studentName, a.student.fullName)
    for (const secret of ['email', 'phone', 'password', 'studentId', 'enrollment', '_id', 'student', 'session']) assert.ok(!Object.hasOwn(verification.data, secret), secret)
    assert.equal((await call('/certificates/verify/does-not-exist')).status, 404)
    await admin(`/certificates/${cert.data._id}/revoke`, 'POST', {})
    assert.equal((await call(`/certificates/verify/${cert.data.certificateId}`)).data.status, 'Revoked')
    assert.equal((await studentCall(b, '/progress')).data.certificates.length, 0)

    const inbox = await studentCall(a, '/notifications'); assert.equal(inbox.status, 200, JSON.stringify(inbox)); assert.ok(inbox.data.items.some(item => item.title === 'Batch Assigned')); assert.ok(inbox.data.unreadCount > 0)
    const notification = inbox.data.items[0]
    assert.equal((await studentCall(b, `/notifications/${notification._id}/read`, 'POST', {})).status, 404)
    assert.equal((await studentCall(a, `/notifications/${notification._id}/read`, 'POST', {})).status, 200)
    await studentCall(a, '/notifications/read-all', 'POST', {})
    assert.equal((await studentCall(a, '/notifications')).data.unreadCount, 0)
    const sent = await admin('/notifications', 'POST', { student: String(b.student._id), title: 'Private update', message: 'For learner B only', href: '/student/tasks' }); assert.equal(sent.status, 201)
    assert.ok(!(await studentCall(a, '/notifications')).data.items.some(item => item.title === 'Private update'))
    assert.ok((await studentCall(b, '/notifications')).data.items.some(item => item.title === 'Private update'))
    assert.equal((await admin('/notifications', 'POST', { student: String(b.student._id), title: 'Bad', message: 'Bad', href: 'https://external.test' })).status, 400)
    const xp = (await studentCall(a, '/gamification')).data; assert.ok(xp.xp > 0); assert.ok(xp.badges.includes('First Task Submitted')); assert.ok(xp.badges.includes('Internship Completed'))
    const leaderboard = (await studentCall(a, '/leaderboard')).data; assert.ok(leaderboard.length); assert.deepEqual(Object.keys(leaderboard[0]).sort(), ['studentId', 'xp'])
    await studentCall(a, '/leaderboard-preference', 'PUT', { excluded: true }); assert.ok(!(await studentCall(b, '/leaderboard')).data.some(item => item.studentId === a.student.studentId))

    const lead = await Enquiry.create({ studentName: 'Customer', email: 'customer@example.test', projectTitle: 'Requested project' })
    const updatedLead = await admin(`/leads/${lead._id}`, 'PATCH', { status: 'Payment Pending', note: 'Awaiting confirmation', followUpDate: days(-1) }); assert.equal(updatedLead.status, 200)
    assert.equal((await admin('/leads?due=true')).data.summary['Follow-ups Due'], 1)
    await call(`/admin/enquiries/${lead._id}/status`, 'PATCH', { status: 'Confirmed' })
    const savedLead = await Enquiry.findById(lead._id); assert.equal(savedLead.status, 'Confirmed'); assert.equal(savedLead.internalNotes.length, 1); assert.equal(savedLead.statusHistory.length, 2)
    const analytics = await admin('/analytics'); assert.equal(analytics.status, 200); assert.equal(analytics.data.counts.totalStudents, 3); assert.equal(analytics.data.counts.certificatesIssued, 2); assert.equal(analytics.data.counts.projectEnquiries, 1)
    assert.ok(analytics.data.charts.domains.some(item => item._id === 'Content Creation' && item.count === 2))
    assert.equal(await Enquiry.countDocuments(), 1)
    for (const [setting, adminUrl, studentUrl] of [['batchesEnabled', '/batches', null], ['tasksEnabled', '/tasks', '/tasks'], ['notificationsEnabled', '/notifications', '/notifications'], ['certificateVerificationEnabled', '/certificates', null], ['gamificationEnabled', null, '/gamification'], ['leaderboardEnabled', null, '/leaderboard']]) {
      await call('/admin/configuration/settings', 'PUT', { [setting]: false })
      if (adminUrl) assert.equal((await admin(adminUrl)).status, 404, setting)
      if (studentUrl) assert.equal((await studentCall(a, studentUrl)).status, 404, setting)
      if (setting === 'certificateVerificationEnabled') assert.equal((await call(`/certificates/verify/${cert.data.certificateId}`)).status, 404)
      await call('/admin/configuration/settings', 'PUT', { [setting]: true })
    }
    assert.equal(await Certificate.countDocuments(), 2); assert.equal(await TaskSubmission.countDocuments(), 1); assert.equal(await InternshipTask.countDocuments(), 3)
    assert.ok(await StudentNotification.countDocuments() > 0); assert.ok(await LearningFile.countDocuments() > 0)
    assert.ok(!(await readdir(directory)).some(name => name.endsWith('.part')))
    assert.ok((await WebsiteConfig.findById('website')).settings.batchesEnabled)
    const info = await admin('/catalog'); assert.equal(info.status, 200); assert.ok(!JSON.stringify(info).includes('passwordHash'))
    // Historical completed batches remain and no production data is touched.
    assert.equal((await InternshipBatch.findById(batch._id)).name, batchBody.name)
    await admin(`/tasks/${domain.data._id}`, 'PATCH', { status: 'Closed' })
    assert.equal((await studentCall(b, `/tasks/${domain.data._id}/submit`, 'POST', { text: 'Too late' })).status, 409)
    const attempts = await Promise.all([a, b].map(who => admin(`/batches/${second._id}/students`, 'POST', { studentId: who.student.studentId })))
    assert.deepEqual(attempts.map(result => result.status).sort(), [201, 409], 'Concurrent requests cannot overbook the last seat')
    assert.equal((await InternshipBatch.findById(second._id)).enrollmentCount, 1)
    const winner = attempts.find(result => result.status === 201).data
    assert.equal((await admin(`/batches/${second._id}/students/${winner._id}`, 'DELETE')).status, 200)
    assert.equal((await BatchEnrollment.findById(winner._id)).status, 'Removed')
    assert.equal((await InternshipBatch.findById(second._id)).enrollmentCount, 0)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'innovix-learning-')), 'Cleanup stays within the generated test directory')
    await rm(directory, { recursive: true, force: true }); delete process.env.LEARNING_STORAGE_DIR
  }
})
