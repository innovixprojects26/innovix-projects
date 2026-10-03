import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { env } from './config/env.js'
import { Project } from './models/index.js'
import { projects } from '../src/data.js'

// Restore only the existing seed catalog. Never overwrite Admin edits or switches.
export async function restoreProjects({ apply = false } = {}) {
  const slugs = projects.map(project => project.slug)
  if (new Set(slugs).size !== slugs.length) throw new Error('Duplicate slugs in the existing seed catalog.')
  const existing = await Project.find().select('slug').lean()
  const stored = new Set(existing.map(project => project.slug))
  const missing = projects.filter(project => !stored.has(project.slug))
  let inserted = 0
  if (apply && missing.length) {
    // Match the original server/seed.js values, including its existing price.
    const records = missing.map(project => new Project({ ...project, price: 2999, published: true }))
    await Promise.all(records.map(record => record.validate()))
    const result = await Project.bulkWrite(records.map(record => {
      const { _id: _unused, ...value } = record.toObject()
      return { updateOne: { filter: { slug: record.slug }, update: { $setOnInsert: value }, upsert: true, timestamps: false } }
    }))
    inserted = result.upsertedCount
  }
  return { mode: apply ? 'apply' : 'preview', originalCatalog: projects.length, missingSlugs: missing.map(project => project.slug), inserted, total: await Project.countDocuments(), available: await Project.countDocuments({ published: true, available: { $ne: false } }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).some(argument => argument !== '--apply')) throw new Error('Use --apply to restore, or no arguments to preview.')
    if (!env.mongoUri) throw new Error('Database configuration is required.')
    await mongoose.connect(env.mongoUri, { autoIndex: false, serverSelectionTimeoutMS: 15000 })
    console.log(JSON.stringify(await restoreProjects({ apply: process.argv.includes('--apply') }), null, 2))
  } catch {
    console.error('Project restoration failed. Check database connectivity, permissions and catalog validation. Connection details withheld.')
    process.exitCode = 1
  } finally { await mongoose.disconnect() }
}
