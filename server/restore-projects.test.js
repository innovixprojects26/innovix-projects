import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { env } from './config/env.js'
import { Project } from './models/index.js'
import { projects } from '../src/data.js'
import { restoreProjects } from './restore-projects.js'

test('restore original catalog without replacing Admin edits or duplicating projects', async () => {
  const dbName = `prj_${randomUUID().replaceAll('-', '')}`
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Project.init()
    const existing = await Project.create({ ...projects[0], price: 4500, published: false, available: false, visibleWhenUnavailable: false, description: 'Existing Admin description' })
    const before = await Project.findById(existing._id).lean()
    assert.equal((await restoreProjects()).missingSlugs.length, projects.length - 1)
    assert.equal(await Project.countDocuments(), 1, 'Preview does not insert records')
    assert.equal((await restoreProjects({ apply: true })).inserted, projects.length - 1)
    assert.deepEqual(await Project.findById(existing._id).lean(), before, 'Preserve every existing field and timestamp')
    for (const source of projects.slice(1)) {
      const saved = await Project.findOne({ slug: source.slug }).lean()
      for (const field of ['title', 'description', 'fullDescription', 'image', 'domain', 'technologies', 'features', 'modules']) assert.deepEqual(saved[field], source[field])
      assert.equal(saved.price, 2999)
      assert.equal(saved.published, true)
    }
    assert.equal((await restoreProjects({ apply: true })).inserted, 0)
    assert.equal(await Project.countDocuments(), projects.length)
    assert.equal((await Project.distinct('slug')).length, projects.length)
  } finally {
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  }
})
