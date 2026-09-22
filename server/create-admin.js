import bcrypt from 'bcryptjs'
import { connectDatabase, closeDatabase } from './config/db.js'
import { env, validateRequiredEnv } from './config/env.js'
import { Admin } from './models/index.js'

validateRequiredEnv({ requireMongo: true, requireAdmin: true })
await connectDatabase()
const email = env.adminEmail.toLowerCase().trim()
const existing = await Admin.findOne({ email })
if (existing) {
  console.log('Admin already exists. No duplicate was created.')
} else {
  await Admin.create({ email, passwordHash: await bcrypt.hash(env.adminInitialPassword, 12) })
  console.log('Admin created successfully.')
}
await closeDatabase()
