import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { resolve } from 'node:path'
import express from 'express'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'

test('Upcoming Events API on isolated localhost MongoDB', { timeout: 120000 }, async (t) => {
  // Set all connection/auth settings BEFORE dynamically importing app modules.
  // Never import server.js, run initialization, or use an application's database URI.
  process.env.NODE_ENV = 'test'
  process.env.DOTENV_CONFIG_PATH = resolve('server/.events-test-no-env')
  process.env.DOTENV_CONFIG_OVERRIDE = 'false'
  process.env.JWT_SECRET = randomBytes(48).toString('hex')
  process.env.RUN_STARTUP_INITIALIZATION = 'false'
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/events_test_unconnected'
  let mongo, server
  try {
    mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'events_test' } })
    const uri = mongo.getUri('events_test')
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/events_test(?:\?|$)/)
    process.env.MONGODB_URI = uri
    const [{ default: adminRoutes }, { default: publicRoutes }, { Event }, { env }] = await Promise.all([
      import('./routes/admin.js'), import('./routes/public.js'), import('./models/event.js'), import('./config/env.js'),
    ])
    assert.equal(env.mongoUri, uri)
    assert.equal(env.jwtSecret, process.env.JWT_SECRET)
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
    assert.equal(mongoose.connection.host, '127.0.0.1')
    await Event.init()
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
    const valid = { title: 'Build together', category: 'Hackathon', description: 'A practical coding event.', eventDate: '2027-02-28T10:00:00+05:30', posterUrl: 'https://example.test/poster.png', registrationUrl: 'https://example.test/register', isFree: true }
    let id
    await t.test('authentication blocks missing, forged and expired tokens on every admin action', async () => {
      const expired = jwt.sign({ id: 'fixture' }, env.jwtSecret, { expiresIn: -1 })
      const forged = jwt.sign({ id: 'fixture' }, 'wrong-test-key')
      for (const auth of [null, 'invalid', expired, forged]) {
        for (const [method, suffix, body] of [['GET', '', undefined], ['POST', '', valid], ['PUT', '/000000000000000000000001', valid], ['PATCH', '/000000000000000000000001', { enabled: true }], ['DELETE', '/000000000000000000000001', undefined]]) {
          assert.equal((await call(`/admin/events${suffix}`, method, body, auth)).status, 401)
        }
      }
      assert.equal(await Event.countDocuments(), 0)
    })
    await t.test('create and list use safe defaults and persist all fields and timestamps', async () => {
      const result = await call('/admin/events', 'POST', valid)
      assert.equal(result.status, 201)
      id = result.data._id
      assert.equal(result.data.enabled, false)
      assert.equal(result.data.status, 'draft')
      assert.ok(result.data.createdAt && result.data.updatedAt)
      assert.equal((await call('/admin/events')).data.length, 1)
      await mongoose.disconnect()
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
      const saved = await Event.findById(id).lean()
      for (const key of Object.keys(valid).filter(key => key !== 'eventDate')) assert.equal(saved[key], valid[key])
      assert.equal(saved.eventDate.toISOString(), new Date(valid.eventDate).toISOString())
      assert.deepEqual((await call('/events', 'GET', undefined, null)).data, [])
    })
    await t.test('strict validation rejects invalid creates and updates without writes', async () => {
      const bad = [
        ...['title', 'category', 'description', 'eventDate'].map(key => ({ ...valid, [key]: undefined })),
        ...[{ title: ' ' }, { title: 'x'.repeat(161) }, { description: 'x'.repeat(2001) }, { category: 'Other' }, { status: 'live' }, { status: null }, { enabled: 'true' }, { isFree: 1 }, { title: {} }, { eventDate: '2027-02-30' }, { eventDate: 'not-a-date' }, { eventDate: 123 }, { eventDate: '2027-03-01T09:00:00' }, { posterUrl: 'javascript:alert(1)' }, { registrationUrl: 'data:text/html,test' }, { posterUrl: '/relative.png' }, { posterUrl: 'https://user:pass@example.test' }, { registrationUrl: 'ftp://example.test' }, { posterUrl: 'https://example.test/' + 'x'.repeat(2048) }, { unknown: true }, { $set: { enabled: true } }, { createdAt: '2027-01-01' }].map(patch => ({ ...valid, ...patch })),
        [], null, {},
      ]
      for (const body of bad) assert.equal((await call('/admin/events', 'POST', body)).status, 400)
      for (const body of [{ enabled: 'false' }, { eventDate: '2027-02-30' }, { status: 'other' }, { _id: id }, { registrationUrl: 'javascript:bad' }, {}]) {
        assert.equal((await call(`/admin/events/${id}`, 'PATCH', body)).status, 400)
      }
      assert.equal(await Event.countDocuments(), 1)
      assert.equal((await Event.findById(id)).title, valid.title)
    })
    await t.test('updates and public filtering require both enabled and published', async () => {
      assert.equal((await call(`/admin/events/${id}`, 'PATCH', { status: 'published' })).status, 200)
      assert.equal((await call('/events', 'GET', undefined, null)).data.length, 0)
      const updated = await call(`/admin/events/${id}`, 'PUT', { ...valid, title: 'Updated event', enabled: true, status: 'published', isFree: false })
      assert.equal(updated.status, 200)
      assert.equal(updated.data.isFree, false)
      assert.ok(new Date(updated.data.updatedAt) >= new Date(updated.data.createdAt))
      for (const [category, enabled, status] of [['Webinar', true, 'draft'], ['Workshop', false, 'published'], ['Tech Competition', false, 'draft']]) {
        assert.equal((await call('/admin/events', 'POST', { ...valid, category, enabled, status })).status, 201)
      }
      const published = await call('/events?enabled=false&status=draft', 'GET', undefined, null)
      assert.equal(published.status, 200)
      assert.deepEqual(published.data.map(item => item._id), [id])
      assert.equal(published.data[0].title, 'Updated event')
      assert.equal((await call('/admin/events')).data.length, 4)
      await call(`/admin/events/${id}`, 'PATCH', { enabled: false })
      assert.equal((await call('/events', 'GET', undefined, null)).data.length, 0)
      assert.equal((await Event.findById(id)).enabled, false)
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await call('/events', method, valid, null)).status, 404)
    })
    await t.test('delete persists and missing or malformed ids return 404', async () => {
      assert.equal((await call(`/admin/events/${id}`, 'DELETE')).status, 200)
      assert.equal(await Event.findById(id), null)
      for (const missing of [id, 'bad-id']) {
        assert.equal((await call(`/admin/events/${missing}`, 'PATCH', { title: 'Missing' })).status, 404)
        assert.equal((await call(`/admin/events/${missing}`, 'DELETE')).status, 404)
      }
      assert.equal((await call('/admin/events')).data.length, 3)
    })
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await mongoose.disconnect()
    // Stopping the owned temporary instance disposes its files. No dropDatabase().
    if (mongo) await mongo.stop()
  }
})
