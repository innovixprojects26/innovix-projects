import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import { connectDatabase, closeDatabase } from './config/db.js'
import { env } from './config/env.js'
import publicRoutes from './routes/public.js'
import adminRoutes from './routes/admin.js'
import { TechNews } from './models/tech-news.js'

test('news API: authentication, validation, draft visibility, publishing, editing and deletion', async () => {
  let server
  const ids = []
  try {
    if (!await connectDatabase()) throw new Error('Configure MONGODB_URI to run the integration test.')
    const app = express()
    app.use(express.json())
    app.use('/api/admin', adminRoutes)
    app.use('/api', publicRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api`
    const token = jwt.sign({ role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })
    const request = async (path, method = 'GET', body, authenticated = false) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, ...(await response.json()) }
    }
    const draft = { title: 'TEMP News API integration test', category: 'Python', description: 'Test description', content: 'Test explanation', keyTakeaways: ['Review code'], studentsShouldLearn: ['Testing'], careerTip: 'Practice daily', readTime: 3, publishDate: '2026-01-01T00:00:00.000Z', featured: false, status: 'draft' }
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      assert.equal((await request(`/admin/tech-news${['PATCH', 'DELETE'].includes(method) ? '/66f000000000000000000002' : ''}`, method, method === 'POST' ? draft : undefined)).status, 401)
    }
    assert.equal((await request('/admin/tech-news', 'POST', { ...draft, readTime: 0 }, true)).status, 400)
    assert.equal((await request('/admin/tech-news', 'POST', { ...draft, keyTakeaways: [] }, true)).status, 400)
    assert.equal((await request('/admin/tech-news', 'POST', { ...draft, category: 'Unknown' }, true)).status, 400)
    const created = await request('/admin/tech-news', 'POST', { ...draft, source: 'untrusted' }, true)
    assert.equal(created.status, 201)
    const id = created.data._id
    ids.push(id)
    assert.equal(created.data.source, 'admin')
    assert.equal((await request(`/tech-news/${id}`)).status, 404)
    assert.ok(!(await request('/tech-news')).data.some((item) => item._id === id))
    assert.ok((await request('/admin/tech-news', 'GET', undefined, true)).data.some((item) => item._id === id))
    assert.equal((await request(`/admin/tech-news/${id}`, 'PATCH', { status: 'published', publishDate: '2099-01-01T00:00:00Z' }, true)).status, 200)
    assert.equal((await request(`/tech-news/${id}`)).status, 404)
    assert.ok(!(await request('/tech-news')).data.some((item) => item._id === id))
    assert.equal((await request(`/admin/tech-news/${id}`, 'PUT', { ...draft, title: 'TEMP Edited news', featured: true, status: 'published' }, true)).status, 200)
    const detail = await request(`/tech-news/${id}`)
    assert.equal(detail.data.title, 'TEMP Edited news')
    assert.equal(detail.data.featured, true)
    assert.deepEqual(detail.data.studentsShouldLearn, ['Testing'])
    const list = (await request('/tech-news')).data
    assert.ok(list.some((item) => item._id === id))
    assert.ok(list.every((item, index) => index === 0 || new Date(list[index - 1].publishDate) >= new Date(item.publishDate)))
    assert.equal(list.find((item) => item._id === id).content, undefined)
    const latest = (await request('/tech-news?latest=true')).data
    assert.equal(latest.length, 1)
    assert.equal(latest[0]._id, list[0]._id)
    assert.equal((await request(`/admin/tech-news/${id}`, 'PATCH', { status: 'draft' }, true)).status, 200)
    assert.equal((await request(`/tech-news/${id}`)).status, 404)
    assert.equal((await request('/tech-news/not-an-id')).status, 404)
    assert.equal((await request(`/admin/tech-news/${id}`, 'DELETE', undefined, true)).status, 200)
    assert.equal((await request(`/admin/tech-news/${id}`, 'DELETE', undefined, true)).status, 404)
  } finally {
    if (ids.length) await TechNews.deleteMany({ _id: { $in: ids } })
    if (server) await new Promise((resolve) => server.close(resolve))
    await closeDatabase()
  }
})
