import bcrypt from 'bcryptjs'
import { connectDatabase, closeDatabase } from './config/db.js'
import { env, validateRequiredEnv } from './config/env.js'
import { Admin } from './models/index.js'
import { validateEmail } from './utils/api.js'

validateRequiredEnv({ requireMongo: true, requireAdmin: true })
const email = env.adminEmail.toLowerCase().trim()
if (!validateEmail(email)) throw new Error('ADMIN_EMAIL must be a valid email address.')

await connectDatabase()
try {
  const admins = await Admin.find({}, { _id: 1 }).limit(2).lean()
  if (admins.length !== 1) throw new Error('Expected exactly one existing admin account; credentials were not changed.')

  const passwordHash = await bcrypt.hash(env.adminInitialPassword, 12)
  const result = await Admin.updateOne(
    { _id: admins[0]._id },
    { $set: { email, passwordHash } },
    { runValidators: true },
  )
  if (result.matchedCount !== 1) throw new Error('Admin account changed during reset; credentials were not updated.')
  console.log('Admin credentials updated successfully.')
} finally {
  await closeDatabase()
}
