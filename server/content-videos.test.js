import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { env } from './config/env.js'

test('Content Creation video upload, privacy, playback ranges, ordering and deletion', async () => {
  const storage = await mkdtemp(path.join(os.tmpdir(), 'innovix-content-video-test-'))
  process.env.CONTENT_VIDEO_STORAGE_DIR = storage
  const dbName = `ivt_${randomUUID().replaceAll('-', '')}`
  let server
  try {
    assert.ok(env.mongoUri && env.jwtSecret, 'MongoDB and JWT configuration required')
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    const { contentVideoAdminRoutes, contentVideoPublicRoutes } = await import('./routes/content-videos.js')
    const { ContentVideo } = await import('./models/content-video.js')
    const { storagePath, matchesSignature, receiveMedia } = await import('./storage/content-videos.js')
    const { Student, StudentSession } = await import('./models/student.js')
    const { InternshipBatch, BatchEnrollment, initializeLearningModels } = await import('./models/learning.js')
    const { hashToken, studentCookieName } = await import('./middleware/student-auth.js')
    const { InternshipDomain, ensureDomains } = await import('./models/management.js')
    await initializeLearningModels()
    await ensureDomains()
    await InternshipDomain.updateOne({ name: 'Content Creation' }, { $set: { recordedClassesEnabled: true } })
    const student = await Student.create({ fullName: 'Video Test Student', email: 'video-test@example.invalid', phone: '+919876543210', college: 'Test College', course: 'Media', yearOfStudy: '1st Year', internshipDomain: 'Content Creation', passwordHash: 'test-only-not-a-login-hash' })
    const studentToken = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    await StudentSession.create({ student: student._id, authVersion: 0, tokenHash: hashToken(studentToken), expiresAt: new Date(Date.now() + 600000) })
    const studentCookie = `${studentCookieName()}=${studentToken}`
    const cyberStudent = await Student.create({ fullName: 'Cyber Test Student', email: 'cyber-test@example.invalid', phone: '+919876543211', college: 'Test College', course: 'Security', yearOfStudy: '1st Year', internshipDomain: 'Cyber Security', passwordHash: 'test-only-not-a-login-hash' })
    const cyberToken = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    await StudentSession.create({ student: cyberStudent._id, authVersion: 0, tokenHash: hashToken(cyberToken), expiresAt: new Date(Date.now() + 600000) })
    const cyberCookie = `${studentCookieName()}=${cyberToken}`
    const day = 86400000
    for (const [domain, learner, code] of [['Content Creation', student, 'CV-CC-TEST'], ['Cyber Security', cyberStudent, 'CV-CS-TEST']]) {
      const batch = await InternshipBatch.create({ name: `${domain} Test Batch`, domain, code, startDate: new Date(Date.now() - day), endDate: new Date(Date.now() + 30 * day), mentor: 'Test Mentor', maxStudents: 5, status: 'Active', enabled: true })
      await BatchEnrollment.create({ student: learner._id, batch: batch._id })
    }
    const app = express()
    app.use(express.json())
    app.use('/admin/content-creation/videos', contentVideoAdminRoutes)
    app.use('/content-creation/videos', contentVideoPublicRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const admin = '/admin/content-creation/videos'
    const pub = '/content-creation/videos'
    const token = jwt.sign({ role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })
    const json = async (route, method = 'GET', data, auth = true) => {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(route.startsWith(pub) ? { Cookie: studentCookie } : {}), ...(auth ? { Authorization: `Bearer ${typeof auth === 'string' ? auth : token}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) })
      return { status: response.status, ...(await response.json()) }
    }
    const studentJson = async (route, cookie) => {
      const response = await fetch(base + route, { headers: { Cookie: cookie } })
      return { status: response.status, ...(await response.json()) }
    }
    const fixture = { title: 'Video test', module: 'Storytelling', description: 'Recording test', publishDate: '2026-01-01T00:00:00Z', status: 'draft' }
    assert.equal((await json(admin, 'GET', undefined, false)).status, 401)
    assert.equal((await json(admin, 'POST', fixture, false)).status, 401)
    assert.equal((await json(admin, 'POST', { ...fixture, title: '' })).status, 400)
    assert.equal((await json(admin, 'POST', { ...fixture, status: 'published' })).status, 400)
    const created = await json(admin, 'POST', { ...fixture, videoFile: '../../bad.mp4' })
    assert.equal(created.status, 201)
    const id = created.data._id
    assert.equal(created.data.hasVideo, false)
    assert.deepEqual((await json(pub, 'GET', undefined, false)).data, [])
    assert.equal((await json(`${pub}/${id}/media/video`, 'GET', undefined, false)).status, 404)
    const mp4 = Buffer.alloc(256)
    mp4.writeUInt32BE(24, 0); mp4.write('ftypisom', 4)
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)])
    const mov = Buffer.from(mp4); mov.write('qt  ', 8)
    assert.ok(matchesSignature(mp4, 'mp4'))
    assert.ok(matchesSignature(webm, 'webm'))
    assert.ok(matchesSignature(mov, 'mov'))
    assert.throws(() => storagePath('../../secrets.env'))
    await assert.rejects(receiveMedia({ headers: { 'content-length': String(1024 ** 3 + 1) } }, 'mp4'), /1 GB/)
    const upload = async (kind, body, extension, auth = true) => {
      const response = await fetch(`${base}${admin}/${id}/upload/${kind}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Extension': extension, ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body })
      return { status: response.status, ...(await response.json()) }
    }
    assert.equal((await upload('video', mp4, 'mp4', false)).status, 401)
    assert.equal((await upload('video', Buffer.from('<script>bad</script>'), 'mp4')).status, 400)
    assert.deepEqual(await readdir(storage), [])
    assert.equal((await upload('video', mp4, 'exe')).status, 400)
    assert.equal((await upload('video', mp4, 'mp4')).status, 200)
    assert.equal((await upload('video', mp4, 'mp4')).status, 409)
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32)])
    assert.equal((await upload('thumbnail', png, 'png')).status, 200)
    const stored = await ContentVideo.findById(id).lean()
    assert.equal((await stat(storagePath(stored.videoFile))).size, mp4.length)
    assert.equal(stored.videoBytes, mp4.length)
    assert.equal(stored.videoFile.includes('/'), false)
    assert.equal((await json(`${pub}/${id}/media/thumbnail`, 'GET', undefined, false)).status, 404)
    const preview = (await json(`${admin}/${id}/preview`, 'POST')).data.token
    // Preview tokens must never grant access to any admin endpoint.
    assert.equal((await json(admin, 'GET', undefined, preview)).status, 401)
    const previewResponse = await fetch(`${base}${pub}/${id}/media/video?preview=${preview}`, { headers: { Range: 'bytes=0-15' } })
    assert.equal(previewResponse.status, 206)
    assert.equal(previewResponse.headers.get('content-range'), `bytes 0-15/${mp4.length}`)
    assert.equal(previewResponse.headers.get('content-disposition'), 'inline')
    assert.equal((await previewResponse.arrayBuffer()).byteLength, 16)
    assert.equal((await json(`${admin}/${id}`, 'PATCH', { status: 'published', publishDate: '2099-01-01T00:00:00Z' })).status, 200)
    assert.equal((await json(pub, 'GET', undefined, false)).data.length, 0)
    assert.equal((await json(`${pub}/${id}/media/video`, 'GET', undefined, false)).status, 404)
    assert.equal((await json(`${admin}/${id}`, 'PATCH', { status: 'published', publishDate: fixture.publishDate, title: 'Edited recording', duration: 65 })).status, 200)
    const listed = (await json(pub, 'GET', undefined, false)).data
    assert.equal(listed.length, 1)
    assert.equal(listed[0].title, 'Edited recording')
    assert.equal(listed[0].duration, 65)
    assert.equal(listed[0].videoFile, undefined)
    assert.equal((await fetch(`${base}${pub}/${id}/media/video`)).status, 401)
    const media = await fetch(`${base}${pub}/${id}/media/video`, { headers: { Range: 'bytes=16-31', Cookie: studentCookie } })
    assert.equal(media.status, 206)
    await media.arrayBuffer()
    assert.deepEqual((await studentJson(pub, cyberCookie)).data, [], 'Cyber Security has an empty recorded-class list when no recordings exist')
    const cyberRecording = await json(admin, 'POST', { ...fixture, title: 'Cyber test recording', domain: 'Cyber Security' })
    assert.equal(cyberRecording.status, 201)
    assert.equal(cyberRecording.data.domain, 'Cyber Security')
    const cyberId = cyberRecording.data._id
    const cyberUpload = await fetch(`${base}${admin}/${cyberId}/upload/video`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Extension': 'mp4', Authorization: `Bearer ${token}` }, body: mp4 })
    assert.equal(cyberUpload.status, 200)
    assert.equal((await json(`${admin}/${cyberId}`, 'PATCH', { status: 'published' })).status, 200)
    const cyberListed = await studentJson(pub, cyberCookie)
    assert.equal(cyberListed.status, 200)
    assert.deepEqual(cyberListed.data.map((item) => item.title), ['Cyber test recording'])
    assert.equal((await studentJson(pub, studentCookie)).data.some((item) => item.domain === 'Cyber Security'), false, 'Internship libraries are isolated')
    const cyberMedia = await fetch(`${base}${pub}/${cyberId}/media/video`, { headers: { Range: 'bytes=0-15', Cookie: cyberCookie } })
    assert.equal(cyberMedia.status, 206)
    await cyberMedia.arrayBuffer()
    assert.notEqual((await fetch(`${base}${pub}/${id}/media/video`, { headers: { Cookie: cyberCookie } })).status, 200, 'Cyber Security students cannot stream Content Creation recordings')
    await InternshipDomain.updateOne({ name: 'Cyber Security' }, { $set: { recordedClassesEnabled: false } })
    assert.equal((await studentJson(pub, cyberCookie)).status, 403)
    assert.equal((await fetch(`${base}${pub}/${cyberId}/media/video`, { headers: { Cookie: cyberCookie } })).status, 403)
    assert.equal((await json(`${admin}?domain=Cyber%20Security`)).data.length, 1, 'The Cyber Security recording remains available to Admin while disabled for students')
    await InternshipDomain.updateOne({ name: 'Cyber Security' }, { $set: { recordedClassesEnabled: true } })
    await InternshipDomain.updateOne({ name: 'Content Creation' }, { $set: { recordedClassesEnabled: false } })
    assert.equal((await studentJson(pub, studentCookie)).status, 403)
    assert.equal((await fetch(`${base}${pub}/${id}/media/video`, { headers: { Cookie: studentCookie } })).status, 403)
    assert.equal((await json(admin)).data.some((item) => item._id === id), true, 'Disabling Content Creation preserves all existing Admin recordings')
    await InternshipDomain.updateOne({ name: 'Content Creation' }, { $set: { recordedClassesEnabled: true } })
    const second = (await json(admin, 'POST', { ...fixture, title: 'Second recording' })).data._id
    assert.equal((await json(`${pub}/${second}/media/video?preview=${preview}`, 'GET', undefined, false)).status, 404)
    assert.equal((await json(`${admin}/reorder`, 'PUT', { ids: [id, id] })).status, 400)
    assert.equal((await json(`${admin}/reorder`, 'PUT', { ids: [id] })).status, 409)
    const reordered = await json(`${admin}/reorder`, 'PUT', { ids: [second, id] })
    assert.equal(reordered.status, 200)
    assert.deepEqual(reordered.data.map((item) => item._id), [second, id])
    assert.equal((await json(`${admin}/${id}`, 'PATCH', { status: 'draft' })).status, 200)
    assert.equal((await json(`${pub}/${id}/media/video`, 'GET', undefined, false)).status, 404)
    assert.equal((await json(`${admin}/${id}`, 'DELETE')).status, 200)
    assert.equal((await json(`${admin}/${cyberId}`, 'DELETE')).status, 200)
    assert.deepEqual(await readdir(storage), [])
    assert.equal(await ContentVideo.findById(id), null)
    assert.equal((await json(`${pub}/${id}/media/video?preview=${preview}`, 'GET', undefined, false)).status, 404)
    assert.equal((await json(`${admin}/invalid`, 'DELETE')).status, 404)
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase()
    } finally {
      await mongoose.disconnect()
      await rm(storage, { recursive: true, force: true })
    }
  }
})
