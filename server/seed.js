import bcrypt from 'bcryptjs'
import { connectDatabase, closeDatabase } from './config/db.js'
import { env, validateRequiredEnv } from './config/env.js'
import { Admin, Project } from './models/index.js'
import { projects } from '../src/data.js'

validateRequiredEnv({ requireMongo: true, requireAdmin: true })
await connectDatabase()
const existingSlugs = new Set((await Project.find({}, { slug: 1 }).lean()).map((project) => project.slug))
const pending = projects.filter((project) => !existingSlugs.has(project.slug)).map((project) => ({ ...project, price: 2999, published: true }))
if (pending.length) await Project.insertMany(pending)
const admin = await Admin.findOne({ email: env.adminEmail.toLowerCase() })
if (!admin) await Admin.create({ email: env.adminEmail, passwordHash: await bcrypt.hash(env.adminInitialPassword, 12) })
console.log(`Seed complete. Added ${pending.length} projects.`)
await closeDatabase()
