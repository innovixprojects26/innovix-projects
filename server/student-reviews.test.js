import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { resolve } from 'node:path'
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'

test('Student Reviews API on isolated localhost MongoDB', { timeout: 120000 }, async (t) => {
  // Set all connection/auth settings BEFORE dynamically importing app modules.
  // Never import server.js, run initialization, or use an application's database URI.
  process.env.NODE_ENV = 'test'
  process.env.DOTENV_CONFIG_PATH = resolve('server/.reviews-test-no-env')
  process.env.DOTENV_CONFIG_OVERRIDE = 'false'
  process.env.JWT_SECRET = randomBytes(48).toString('hex')
  process.env.RUN_STARTUP_INITIALIZATION = 'false'
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/reviews_test_unconnected'
  let mongo, server
  try {
    mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'reviews_test' } })
    const uri = mongo.getUri('reviews_test')
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/reviews_test(?:\?|$)/)
    process.env.MONGODB_URI = uri
    const [{ default: adminRoutes }, { default: publicRoutes }, { StudentReview }, { env }] = await Promise.all([
      import('./routes/admin.js'), import('./routes/public.js'), import('./models/student-review.js'), import('./config/env.js'),
    ])
    assert.equal(env.mongoUri, uri)
    assert.equal(env.jwtSecret, process.env.JWT_SECRET)
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
    assert.equal(mongoose.connection.host, '127.0.0.1')
    await StudentReview.init()
    const app = express()
    app.use(express.json())
    app.use('/api', publicRoutes)
    app.use('/api/admin', adminRoutes)
    app.use((_req, res) => res.status(404).json({ success: false }))
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false }))
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })
    const call = async (path, method = 'GET', body, auth = token) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, ...await response.json() }
    }
    // Synthetic fixtures exist only inside this disposable local instance.
    const valid = { studentName: 'Test fixture', domain: 'Test domain', rating: 4, reviewText: 'Synthetic review for isolated API tests.', avatarUrl: 'https://example.test/avatar.png' }
    const base = '/admin/student-reviews'
    const publicPath = '/student-reviews'
    let id
    const verify = async (reviewId = id, evidence = 'Isolated fixture evidence reference') => {
      const record = await StudentReview.findById(reviewId).lean()
      return call(`${base}/${reviewId}/verify`, 'POST', { evidence, updatedAt: record.updatedAt.toISOString() })
    }
    await t.test('authentication protects every admin operation', async () => {
      for (const auth of [null, 'invalid', jwt.sign({ id: 'fixture' }, 'wrong-test-key'), jwt.sign({ id: 'fixture' }, env.jwtSecret, { expiresIn: -1 })]) {
        for (const [method, suffix, body] of [['GET', '', undefined], ['POST', '', valid], ['PUT', '/000000000000000000000001', valid], ['PATCH', '/000000000000000000000001', { approved: true }], ['DELETE', '/000000000000000000000001', undefined], ['POST', '/000000000000000000000001/verify', {}]]) {
          assert.equal((await call(base + suffix, method, body, auth)).status, 401)
        }
      }
      assert.equal(await StudentReview.countDocuments(), 0)
    })
    await t.test('CRUD creates safe defaults and persists across reconnect', async () => {
      const created = await call(base, 'POST', valid)
      assert.equal(created.status, 201)
      id = created.data._id
      for (const flag of ['verified', 'approved', 'enabled']) assert.equal(created.data[flag], false)
      assert.ok(created.data.createdAt && created.data.updatedAt)
      assert.equal((await call(base)).data.length, 1)
      assert.deepEqual((await call(publicPath, 'GET', undefined, null)).data, [])
      assert.equal((await call(`${base}/${id}`, 'PUT', { ...valid, rating: 5 })).status, 200)
      await mongoose.disconnect()
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
      const saved = await StudentReview.findById(id).lean()
      assert.equal(saved.rating, 5)
      assert.equal(saved.studentName, valid.studentName)
    })
    await t.test('strict validation rejects invalid fields and mass assignment without writes', async () => {
      const patches = [{ studentName: '' }, { studentName: ' ' }, { domain: 'x'.repeat(121) }, { studentName: 'x'.repeat(121) }, { reviewText: 'x'.repeat(2001) }, { reviewText: null }, { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: '5' }, { rating: null }, { enabled: 'true' }, { approved: 1 }, { verified: true }, { verified: 'false' }, { avatarUrl: 'javascript:alert(1)' }, { avatarUrl: 'data:image/png,test' }, { avatarUrl: '/relative.png' }, { avatarUrl: 'https://user:pass@example.test' }, { avatarUrl: 'https://example.test/' + 'a'.repeat(2048) }, { email: 'private@example.test' }, { verificationEvidence: 'bypass' }, { verifiedBy: 'bypass' }, { $set: { verified: true } }, { createdAt: '2026-01-01' }]
      for (const patch of patches) {
        assert.equal((await call(base, 'POST', { ...valid, ...patch })).status, 400)
        assert.equal((await call(`${base}/${id}`, 'PATCH', patch)).status, 400)
      }
      for (const key of ['studentName', 'domain', 'reviewText', 'rating']) {
        const body = { ...valid }; delete body[key]
        assert.equal((await call(base, 'POST', body)).status, 400)
      }
      for (const body of [[], null, {}]) assert.equal((await call(base, 'POST', body)).status, 400)
      assert.equal(await StudentReview.countDocuments(), 1)
      assert.equal((await StudentReview.findById(id)).rating, 5)
    })
    await t.test('approval is separate from evidence-based explicit verification', async () => {
      const approved = await call(`${base}/${id}`, 'PATCH', { approved: true, enabled: true })
      assert.equal(approved.status, 200)
      assert.equal(approved.data.verified, false)
      assert.equal((await call(publicPath, 'GET', undefined, null)).data.length, 0)
      for (const body of [{}, { evidence: ' ' }, { evidence: 'x'.repeat(2001), updatedAt: approved.data.updatedAt }, { evidence: 'reference', updatedAt: 'bad' }, { evidence: 'reference', updatedAt: approved.data.updatedAt, verifiedBy: 'forged' }]) {
        assert.equal((await call(`${base}/${id}/verify`, 'POST', body)).status, 400)
      }
      const noIdentity = jwt.sign({ role: 'admin' }, env.jwtSecret)
      assert.equal((await call(`${base}/${id}/verify`, 'POST', { evidence: 'reference', updatedAt: approved.data.updatedAt }, noIdentity)).status, 403)
      const verified = await verify()
      assert.equal(verified.status, 200)
      assert.equal(verified.data.verified, true)
      assert.ok(verified.data.verifiedBy && verified.data.verifiedAt)
      assert.equal(verified.data.verificationEvidence, 'Isolated fixture evidence reference')
      assert.equal((await call(`${base}/${id}/verify`, 'POST', { evidence: 'stale', updatedAt: '2000-01-01T00:00:00Z' })).status, 409)
      const result = await call(publicPath + '?approved=false&verified=false', 'GET', undefined, null)
      assert.equal(result.status, 200)
      assert.deepEqual(result.data.map(item => item._id), [id])
      const allowed = ['_id', 'studentName', 'domain', 'rating', 'reviewText', 'avatarUrl', 'verified', 'createdAt', 'updatedAt']
      assert.deepEqual(Object.keys(result.data[0]).sort(), allowed.sort())
      assert.equal(JSON.stringify(result).includes('fixture evidence'), false)
      const changed = await call(`${base}/${id}`, 'PATCH', { reviewText: 'Changed fixture content', approved: true })
      assert.equal(changed.data.verified, false)
      assert.equal(changed.data.approved, false)
      const stored = await StudentReview.findById(id).select('+verificationEvidence +verifiedBy +verifiedAt').lean()
      assert.equal(stored.verificationEvidence, undefined)
      assert.equal(stored.verifiedBy, undefined)
      assert.equal(stored.verifiedAt, undefined)
      assert.equal((await call(publicPath, 'GET', undefined, null)).data.length, 0)
      assert.equal((await verify()).data.approved, false, 'Verification does not imply approval')
      await call(`${base}/${id}`, 'PATCH', { approved: true })
      assert.equal((await call(publicPath, 'GET', undefined, null)).data.length, 1)
      const revoked = await call(`${base}/${id}`, 'PATCH', { verified: false })
      assert.equal(revoked.data.verified, false)
      assert.equal(revoked.data.verificationEvidence, undefined)
    })
    await t.test('public requires every flag, omits private fields, and disallows writes', async () => {
      const expected = []
      for (const approved of [false, true]) for (const enabled of [false, true]) for (const verified of [false, true]) {
        const created = await call(base, 'POST', { ...valid, avatarUrl: '', approved, enabled })
        assert.equal(created.status, 201)
        if (verified) assert.equal((await verify(created.data._id)).status, 200)
        if (approved && enabled && verified) expected.push(created.data._id)
      }
      assert.deepEqual((await call(publicPath, 'GET', undefined, null)).data.map(item => item._id), expected)
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await call(publicPath, method, valid, null)).status, 404)
    })
    await t.test('deletion persists; missing and malformed ids return 404', async () => {
      assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 200)
      assert.equal(await StudentReview.findById(id), null)
      for (const missing of [id, 'bad-id']) {
        assert.equal((await call(`${base}/${missing}`, 'PATCH', { approved: true })).status, 404)
        assert.equal((await call(`${base}/${missing}`, 'DELETE')).status, 404)
        assert.equal((await call(`${base}/${missing}/verify`, 'POST', { evidence: 'reference', updatedAt: new Date().toISOString() })).status, 404)
      }
    })
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await mongoose.disconnect()
    // Dispose only the owned temporary MongoDB instance; never dropDatabase().
    if (mongo) await mongo.stop()
  }
})
