import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import { env } from './config/env.js'
import { createStudentRouter } from './routes/student.js'
import { Student } from './models/student.js'

test('one active browser and new-device OTP: delivery, binding, limits, expiry, replay and revocation', async () => {
  const dbName = `idt_${randomUUID().replaceAll('-', '')}`
  let server, code, emailAvailable = true, deliveryFails = false
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017', { dbName })
    const app = express(); app.use(express.json())
    app.use('/student', createStudentRouter({ emailConfigured: () => emailAvailable, sendDeviceEmail: async (_email, value) => { if (deliveryFails) throw Error('mock mail outage'); code = value } }))
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const call = async (route, body, cookie = '') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/student${route}`, { method: body ? 'POST' : 'GET', headers: { Origin: new URL(env.clientUrl).origin, 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const cookies = response.headers.getSetCookie()
      return { status: response.status, ...(await response.json()), device: cookies.find(x => x.startsWith('innovix_device='))?.split(';')[0], session: cookies.find(x => x.startsWith('innovix_student='))?.split(';')[0] }
    }
    const credentials = { email: 'device-test@example.invalid', password: 'Learn@Code9' }
    assert.equal((await call('/register', { ...credentials, confirmPassword: credentials.password, fullName: 'Device Test', phoneCountry: 'IN', phone: '9876543210', college: 'Test', course: 'Test', yearOfStudy: 'Final Year', internshipDomain: 'Python Developer' })).status, 201)
    const first = await call('/login', credentials)
    assert.equal(first.status, 200); assert.ok(first.session)
    const second = await call('/login', credentials)
    assert.equal(second.data.requiresOtp, true); assert.equal(second.session, undefined)
    assert.equal((await call('/me', null, first.session)).status, 200, 'Old session survives an unverified new-device login')
    const verify = (challenge, value, cookie = second.device) => call('/login/verify-device', { challengeId: challenge, code: value }, cookie)
    assert.equal((await verify(second.data.challengeId, code, first.device)).status, 401, 'OTP is bound to the requesting browser')
    for (let i = 0; i < 5; i++) assert.equal((await verify(second.data.challengeId, '000000')).status, 401)
    assert.equal((await verify(second.data.challengeId, code)).status, 401, 'Five failures block even the correct code')
    const retry = await call('/login', credentials, second.device)
    const result = await verify(retry.data.challengeId, code)
    assert.equal(result.status, 200); assert.ok(result.session)
    assert.equal((await verify(retry.data.challengeId, code)).status, 401, 'Code cannot be replayed')
    assert.equal((await call('/me', null, first.session)).status, 401, 'Previous device loses backend access immediately')
    assert.equal((await call('/me', null, result.session)).status, 200)
    const trusted = await call('/login', credentials, second.device)
    assert.ok(trusted.session); assert.equal(trusted.data.requiresOtp, undefined)
    assert.equal((await call('/me', null, result.session)).status, 401, 'Only one session remains active even on the same browser')
    emailAvailable = false
    assert.equal((await call('/login', credentials)).status, 503)
    assert.equal((await call('/me', null, trusted.session)).status, 200)
    emailAvailable = true; deliveryFails = true
    assert.equal((await call('/login', credentials)).status, 503)
    deliveryFails = false
    const expired = await call('/login', credentials)
    await Student.updateOne({ email: credentials.email }, { $set: { 'loginChallenge.expiresAt': new Date(0) } })
    assert.equal((await verify(expired.data.challengeId, code, expired.device)).status, 401)
    const concurrent = await Promise.all([call('/login', credentials, second.device), call('/login', credentials, second.device)])
    const statuses = await Promise.all(concurrent.map(item => call('/me', null, item.session).then(x => x.status)))
    assert.deepEqual(statuses.sort(), [200, 401], 'Concurrent logins leave exactly one usable session')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (mongoose.connection.name === dbName && dbName.startsWith('idt_')) await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  }
})
