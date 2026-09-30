import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { env } from './config/env.js'
import adminRoutes from './routes/admin.js'
import { discoverAdminRoutes, discoverStudentRoutes } from './routes/discover.js'
import { Admin } from './models/index.js'
import { Student, StudentSession } from './models/student.js'
import { WebsiteConfig } from './models/management.js'
import { DiscoverCategory, DiscoverItem, DiscoverSource, DiscoverRead, ensureDiscoverCategories } from './models/discover.js'
import { hashToken, studentCookieName, csrfFor } from './middleware/student-auth.js'
import { ingestSource, refreshDiscoverSources } from './services/discover-ingest.js'

test('Discover management, domain personalization, private read states, approvals, ingestion and switches', async () => {
  const dbName = `dsc_${randomUUID().replaceAll('-', '')}`
  let server
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Promise.all([Admin.init(), Student.init(), StudentSession.init(), DiscoverItem.init(), DiscoverSource.init(), DiscoverRead.init()])
    await ensureDiscoverCategories()
    const password = 'Learn@Code9'
    await Admin.create({ email: 'discover-admin@example.test', passwordHash: await bcrypt.hash(password, 4) })
    const app = express()
    app.use(express.json())
    app.use('/api/admin/discover', discoverAdminRoutes)
    app.use('/api/admin', adminRoutes)
    app.use('/api/student/discover', discoverStudentRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api`
    let token
    const call = async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: new URL(env.clientUrl).origin, ...(token && path.startsWith('/admin') ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, ...await response.json() }
    }
    assert.equal((await call('/student/discover')).status, 401)
    for (const resource of ['items', 'sources', 'categories']) assert.equal((await call(`/admin/discover/${resource}`)).status, 401)
    token = (await call('/admin/login', 'POST', { email: 'discover-admin@example.test', password })).data.token
    assert.ok(token)
    const config = (await call('/admin/configuration')).data.settings
    assert.equal(config.discoverEnabled, true)
    assert.equal(config.discoverImportEnabled, false)
    assert.equal(config.discoverPublishingMode, 'manual')
    assert.equal((await call('/admin/configuration/settings', 'PUT', { discoverPublishingMode: 'unrestricted' })).status, 400)
    assert.equal((await call('/admin/discover/refresh', 'POST', {})).data.disabled, true)
    const domains = ['Full Stack Development', 'Data Analytics', 'Content Creation', 'Cyber Security', 'UI/UX Designer', 'Frontend Developer', 'Python Developer', 'AI & Machine Learning']
    const identities = []
    for (const [i, domain] of domains.entries()) {
      const student = await Student.create({ fullName: `Learner ${i}`, email: `student-${i}@example.test`, phone: '+919876543210', college: 'College', course: 'Course', yearOfStudy: '1st Year', internshipDomain: domain, passwordHash: 'test-only', authVersion: 0 })
      const sessionToken = randomBytes(32).toString('hex')
      await StudentSession.create({ student: student._id, tokenHash: hashToken(sessionToken), authVersion: 0, expiresAt: new Date(Date.now() + 3600000) })
      identities.push({ student, headers: { Cookie: `${studentCookieName()}=${sessionToken}`, 'X-CSRF-Token': csrfFor(sessionToken) } })
    }
    const categories = (await call('/admin/discover/categories')).data
    const basic = { title: 'Learning update', summary: 'A short explanation.', whyItMatters: 'Useful practice.', whatYouCanLearn: 'Practice and review.', takeaway: 'Understand your work.', domains: ['General'], category: 'Technology & Careers', status: 'published', type: 'QUICK_LEARN' }
    const items = []
    for (const domain of domains) {
      const category = categories.find(item => item.domains.includes(domain)).name
      const result = await call('/admin/discover/items', 'POST', { ...basic, title: `${domain} learning`, domains: [domain], category })
      assert.equal(result.status, 201, result.message)
      items.push(result.data)
    }
    const general = await call('/admin/discover/items', 'POST', { ...basic, title: 'General insight', featured: true })
    assert.equal(general.status, 201)
    for (const [index, identity] of identities.entries()) {
      const feed = await call('/student/discover?domain=other', 'GET', undefined, identity.headers)
      assert.equal(feed.status, 200)
      assert.equal(feed.data.items[0]._id, items[index]._id, domains[index])
      assert.equal(feed.data.items.length, 2)
      assert.equal(feed.data.unreadCount, 2)
      assert.equal(feed.data.items[0].isNew, true)
      assert.equal((await call(`/student/discover/${items[(index + 1) % items.length]._id}`, 'GET', undefined, identity.headers)).status, 404)
    }
    const first = identities[0]
    const other = identities[1]
    assert.equal((await call(`/student/discover/${general.data._id}/read`, 'POST', {}, { Cookie: first.headers.Cookie })).status, 403)
    assert.equal((await call(`/student/discover/${general.data._id}/read`, 'POST', {}, { ...first.headers, Origin: 'https://untrusted.example' })).status, 403)
    assert.equal((await call(`/student/discover/${general.data._id}/read`, 'POST', { student: other.student._id }, first.headers)).status, 200)
    await call(`/student/discover/${general.data._id}/read`, 'POST', {}, first.headers)
    assert.equal(await DiscoverRead.countDocuments(), 1)
    assert.equal((await call(`/student/discover/${general.data._id}`, 'GET', undefined, first.headers)).data.read, true)
    assert.equal((await call(`/student/discover/${general.data._id}`, 'GET', undefined, other.headers)).data.read, false)
    assert.equal((await call('/student/discover', 'GET', undefined, first.headers)).data.unreadCount, 1)
    assert.equal((await call('/student/discover?tab=Facts', 'GET', undefined, first.headers)).data.items.length, 0)
    assert.equal((await call('/admin/discover/items', 'POST', { ...basic, type: 'FACT', sourceName: 'External publisher', sourceUrl: '' })).status, 400)
    assert.equal((await call('/admin/discover/items', 'POST', { ...basic, sourceUrl: 'javascript:alert(1)' })).status, 400)
    await call(`/admin/discover/items/${general.data._id}`, 'PATCH', { status: 'draft' })
    assert.equal((await call(`/student/discover/${general.data._id}`, 'GET', undefined, first.headers)).status, 404)
    await call(`/admin/discover/items/${general.data._id}`, 'PATCH', { status: 'published' })
    const old = await DiscoverItem.create({ ...basic, title: 'Old fact', type: 'FACT', publishedAt: new Date(Date.now() - 20 * 86400000) })
    assert.equal((await call(`/student/discover/${old._id}`, 'GET', undefined, first.headers)).data.isNew, false)
    await DiscoverItem.create({ ...basic, title: 'Future', publishedAt: new Date(Date.now() + 86400000) })
    assert.ok(!(await call('/student/discover', 'GET', undefined, first.headers)).data.items.some(item => item.title === 'Future'))
    await DiscoverItem.insertMany(Array.from({ length: 21 }, (_, i) => ({ ...basic, title: `Pagination ${i}` })))
    const page = await call('/student/discover', 'GET', undefined, first.headers)
    assert.equal(page.data.items.length, 20)
    assert.equal(page.data.hasMore, true)
    const page2 = await call('/student/discover?page=2', 'GET', undefined, first.headers)
    assert.ok(page2.data.items.length > 0)
    assert.ok(page2.data.items.every(item => !page.data.items.some(previous => previous._id === item._id)))

    const sourcePayload = { name: 'Fixture publisher', url: 'https://example.com/feed.xml', type: 'RSS', categories: ['Web Development'], domains: ['Full Stack Development'], active: true }
    assert.equal((await call('/admin/discover/sources', 'POST', { ...sourcePayload, url: 'https://127.0.0.1/feed' })).status, 400)
    const createdSource = await call('/admin/discover/sources', 'POST', sourcePayload)
    assert.equal(createdSource.status, 201, createdSource.message)
    const sourceId = createdSource.data._id
    let fetches = 0
    const fixture = url => `<rss><channel><item><title>React fixture release</title><link>${url}</link><description><![CDATA[<p>React fixture update for API learning.</p><script>evil()</script>]]></description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`
    const fetcher = async () => { fetches++; return { text: fixture('https://example.com/article?utm_source=feed') } }
    assert.equal((await ingestSource(sourceId, { fetcher })).skipped, true)
    assert.equal(fetches, 0)
    await call('/admin/configuration/settings', 'PUT', { discoverImportEnabled: true })
    assert.equal((await ingestSource(sourceId, { fetcher })).imported, 1)
    const imported = await DiscoverItem.findOne({ imported: true }).lean()
    assert.equal(imported.status, 'pending')
    assert.equal(imported.originalTitle, 'React fixture release')
    assert.ok(!imported.summary.includes('evil'))
    assert.equal((await call(`/student/discover/${imported._id}`, 'GET', undefined, first.headers)).status, 404)
    assert.equal((await call(`/admin/discover/items/${imported._id}`, 'PATCH', { status: 'published', domains: ['Content Creation'], category: 'Creators', featured: true })).status, 200)
    assert.equal((await call(`/student/discover/${imported._id}`, 'GET', undefined, identities[2].headers)).status, 200)
    assert.equal((await call(`/student/discover/${imported._id}`, 'GET', undefined, first.headers)).status, 404)
    await call(`/admin/discover/items/${imported._id}`, 'PATCH', { status: 'rejected' })
    assert.equal((await ingestSource(sourceId, { fetcher })).skipped, true, '15 minute cooldown')
    await DiscoverSource.updateOne({ _id: sourceId }, { $unset: { nextFetchAt: 1 } })
    assert.equal((await ingestSource(sourceId, { fetcher })).duplicates, 1)
    assert.equal((await DiscoverItem.findById(imported._id)).status, 'rejected', 'Reimport cannot undo editorial rejection')
    await call(`/admin/discover/sources/${sourceId}`, 'PATCH', { active: false })
    const before = fetches
    assert.equal((await ingestSource(sourceId, { fetcher })).skipped, true)
    assert.equal(fetches, before)
    await call(`/admin/discover/sources/${sourceId}`, 'PATCH', { active: true })
    await DiscoverSource.updateOne({ _id: sourceId }, { $unset: { nextFetchAt: 1 } })
    await call('/admin/configuration/settings', 'PUT', { discoverPublishingMode: 'auto' })
    assert.equal((await ingestSource(sourceId, { fetcher: async () => ({ text: fixture('https://example.com/auto') }) })).imported, 1)
    assert.equal((await DiscoverItem.findOne({ sourceUrl: 'https://example.com/auto' })).status, 'published')
    await DiscoverSource.updateOne({ _id: sourceId }, { $unset: { nextFetchAt: 1 } })
    const concurrent = await Promise.all([ingestSource(sourceId, { fetcher }), ingestSource(sourceId, { fetcher })])
    assert.equal(concurrent.filter(item => item.skipped === true).length, 1)
    await DiscoverSource.updateOne({ _id: sourceId }, { $unset: { nextFetchAt: 1 } })
    assert.equal((await ingestSource(sourceId, { fetcher: async () => { throw new Error('secret transport details') } })).failed, true)
    const health = (await call('/admin/discover/sources')).data[0]
    assert.equal(health.fetchStatus, 'Failed')
    assert.ok(health.lastFetchedAt)
    assert.ok(!JSON.stringify(health).includes('secret transport details'))
    assert.ok(!JSON.stringify(health).includes('lease'))
    assert.equal((await refreshDiscoverSources({ fetcher })).results.length, 0)
    assert.equal((await call(`/admin/discover/items/${imported._id}`, 'DELETE')).status, 200)
    assert.ok(!(await call('/admin/discover/items')).data.items.some(item => item._id === String(imported._id)))
    assert.equal((await DiscoverItem.findById(imported._id).lean()).title, undefined)
    await DiscoverSource.updateOne({ _id: sourceId }, { $unset: { nextFetchAt: 1 } })
    assert.equal((await ingestSource(sourceId, { fetcher })).duplicates, 1, 'Deleted imports retain a hash tombstone')
    assert.equal((await DiscoverItem.findById(imported._id).lean()).title, undefined)
    const category = await call('/admin/discover/categories', 'POST', { name: 'Test category', domains: ['General'], keywords: ['test'], active: true })
    assert.equal(category.status, 201)
    assert.equal((await call(`/admin/discover/categories/${category.data._id}`, 'PATCH', { domains: ['Cyber Security'], keywords: ['privacy'] })).status, 200)
    assert.equal((await call(`/admin/discover/categories/${category.data._id}`, 'DELETE')).status, 200)
    const usedCategory = await DiscoverCategory.findOne({ name: 'Web Development' })
    assert.equal((await call(`/admin/discover/categories/${usedCategory._id}`, 'DELETE')).status, 409)
    await call(`/admin/discover/categories/${usedCategory._id}`, 'PATCH', { active: false })
    assert.equal((await call(`/student/discover/${items[0]._id}`, 'GET', undefined, first.headers)).status, 404)
    await call('/admin/configuration/settings', 'PUT', { discoverEnabled: false })
    assert.equal((await call('/student/discover', 'GET', undefined, first.headers)).status, 404)
    assert.ok(await DiscoverItem.countDocuments() > 0)
    assert.equal((await call('/admin/discover/items')).status, 200)
    await call('/admin/configuration/settings', 'PUT', { discoverEnabled: true })
    assert.equal((await call('/student/discover', 'GET', undefined, first.headers)).status, 200)
    await call('/admin/configuration/settings', 'PUT', { newsEnabled: false })
    assert.equal((await call('/student/discover', 'GET', undefined, first.headers)).status, 404)
    assert.equal((await call('/admin/discover/items')).status, 200, 'News OFF preserves admin content access')
    await call('/admin/configuration/settings', 'PUT', { newsEnabled: true })
    assert.equal((await call('/student/discover', 'GET', undefined, first.headers)).status, 200)
    await call(`/admin/discover/sources/${sourceId}`, 'DELETE')
    assert.ok(await DiscoverItem.exists({ _id: imported._id }))
    await call(`/admin/discover/items/${general.data._id}`, 'DELETE')
    assert.equal(await DiscoverRead.countDocuments({ item: general.data._id }), 0)
    assert.ok((await WebsiteConfig.findById('website')).discoverCategoriesInitialized)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  }
})
