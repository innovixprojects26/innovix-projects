import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createApiLimiters } from './middleware/api-limits.js'

test('settings polling and general API budgets are independent and return JSON on limits', async () => {
  const app = express()
  app.use('/api', ...createApiLimiters({ apiLimit: 2, configurationLimit: 3 }))
  app.get('/api/configuration', (_req, res) => res.json({ success: true, data: { settings: {} } }))
  app.get('/api/projects', (_req, res) => res.json({ success: true, data: [] }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const request = path => fetch(`http://127.0.0.1:${server.address().port}/api${path}`)
  try {
    assert.equal((await request('/configuration')).status, 200)
    for (let i = 0; i < 2; i++) assert.equal((await request('/projects')).status, 200)
    assert.equal((await request('/projects')).status, 429)
    // A busy API must not make the entire website fail to load its settings.
    for (let i = 0; i < 2; i++) assert.equal((await request('/configuration?poll=true')).status, 200)
    const limited = await request('/configuration')
    assert.equal(limited.status, 429)
    assert.equal((await limited.json()).success, false)
    assert.ok(limited.headers.has('retry-after'))
  } finally { await new Promise(resolve => server.close(resolve)) }
})
