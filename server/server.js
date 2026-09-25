import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { connectDatabase, closeDatabase } from './config/db.js'
import { env, validateRequiredEnv } from './config/env.js'
import { Admin } from './models/index.js'
import publicRoutes from './routes/public.js'
import adminRoutes from './routes/admin.js'
import { contentVideoAdminRoutes, contentVideoPublicRoutes } from './routes/content-videos.js'
import studentRoutes from './routes/student.js'
import { studentCookieOptions } from './middleware/student-auth.js'

const app = express()
if (env.trustProxyHops) app.set('trust proxy', env.trustProxyHops)
app.use(helmet())
app.use(['/api/student', '/api/content-creation/videos'], cors({ origin: env.clientUrl, credentials: true }))
app.use(cors({ origin: env.clientUrl, credentials: false }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (_req, res) => res.json({ success: true, data: { service: 'innovix-api', database: Boolean(env.mongoUri) } }))
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }))
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }))
app.use('/api/student', studentRoutes)
app.use('/api/content-creation/videos', contentVideoPublicRoutes)
app.use('/api/admin/content-creation/videos', contentVideoAdminRoutes)
app.use('/api', publicRoutes)
app.use('/api/admin', adminRoutes)
app.use((error, req, res, _next) => {
  // JSON-parser errors can include the raw body; never log student credentials.
  if (req.path.startsWith('/api/student')) return res.status(error.status === 400 || error.status === 413 ? error.status : 500).json({ success: false, message: 'The student request could not be processed. Check the input and try again.' })
  console.error(error)
  res.status(500).json({ success: false, message: 'Unexpected server error' })
})

async function ensureAdmin() {
  if (!env.adminEmail || !env.adminInitialPassword || !env.mongoUri) return
  const existing = await Admin.findOne({ email: env.adminEmail.toLowerCase() })
  if (!existing) await Admin.create({ email: env.adminEmail, passwordHash: await bcrypt.hash(env.adminInitialPassword, 12) })
}

let server
async function start() {
  validateRequiredEnv({ requireMongo: true, requireAdmin: true })
  studentCookieOptions()
  await connectDatabase()
  await ensureAdmin()
  server = app.listen(env.port, () => console.log(`Innovix API listening on port ${env.port}`))
}
start().catch((error) => { console.error('Server startup failed:', error.message); process.exitCode = 1 })
process.on('SIGINT', async () => { await closeDatabase(); server?.close(() => process.exit(0)) })
process.on('SIGTERM', async () => { await closeDatabase(); server?.close(() => process.exit(0)) })
export default app
