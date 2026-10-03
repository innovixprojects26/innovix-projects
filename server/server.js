import { learningStudentRoutes, learningAdminRoutes, certificatePublicRoutes } from './routes/learning.js'
import { initializeLearningModels } from './models/learning.js'
import { discoverStudentRoutes, discoverAdminRoutes } from './routes/discover.js'
import { ensureDiscoverCategories } from './models/discover.js'
import { ensureDomains } from './models/management.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDatabase, closeDatabase } from './config/db.js'
import { env, validateRequiredEnv } from './config/env.js'
import { Admin } from './models/index.js'
import publicRoutes from './routes/public.js'
import adminRoutes from './routes/admin.js'
import { contentVideoAdminRoutes, contentVideoPublicRoutes } from './routes/content-videos.js'
import studentRoutes from './routes/student.js'
import { studentCookieOptions } from './middleware/student-auth.js'
import { createApiLimiters } from './middleware/api-limits.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '../dist')

const app = express()
app.set('trust proxy', 1)
// if (env.trustProxyHops) app.set('trust proxy', env.trustProxyHops)
app.use(helmet())
const allowedOrigins = new Set([
  env.clientUrl,
  env.clientUrl.replace(/\/$/, ''),
  'https://innovixprojects.sempraxis.com',
  'https://innovixprojects.sempraxis.com/',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    try {
      const normalized = new URL(origin).origin
      if (allowedOrigins.has(origin) || allowedOrigins.has(normalized)) return callback(null, true)
    } catch {
      return callback(new Error('Invalid origin'))
    }
    callback(new Error('Origin not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (_req, res) => res.json({ success: true, data: { service: 'innovix-api', database: Boolean(env.mongoUri) } }))
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }))
app.use('/api', ...createApiLimiters())
app.use('/api/student/learning', learningStudentRoutes)
app.use('/api/admin/learning', learningAdminRoutes)
app.use('/api/certificates/verify', certificatePublicRoutes)
app.use('/api/student/discover', discoverStudentRoutes)
app.use('/api/student', studentRoutes)
app.use('/api/admin/discover', discoverAdminRoutes)
app.use('/api/content-creation/videos', contentVideoPublicRoutes)
app.use('/api/admin/content-creation/videos', contentVideoAdminRoutes)
app.use('/api', publicRoutes)
app.use('/api/admin', adminRoutes)
app.use(express.static(distDir))
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(distDir, 'index.html'))
})
app.use((error, req, res, _next) => {
  // JSON-parser errors can include the raw body; never log student credentials.
  if (req.path.startsWith('/api/student')) return res.status(error.status === 400 || error.status === 413 ? error.status : 500).json({ success: false, message: 'The student request could not be processed. Check the input and try again.' })
  console.error(error)
  res.status(500).json({ success: false, message: 'Unexpected server error' })
})

async function ensureAdmin() {
  if (!env.adminEmail || !env.adminInitialPassword || !env.mongoUri) return
  const email = env.adminEmail.toLowerCase().trim()
  const existing = await Admin.findOne({ email })
  if (!existing) await Admin.create({ email, passwordHash: await bcrypt.hash(env.adminInitialPassword, 12) })
}

let server
async function start() {
  validateRequiredEnv({ requireMongo: true, requireAdmin: true })
  studentCookieOptions()
  await connectDatabase()
  await ensureAdmin()
  await ensureDomains()
  await ensureDiscoverCategories()
  await initializeLearningModels()
  server = app.listen(env.port, () => console.log(`Innovix API listening on port ${env.port}`))
}
start().catch((error) => { console.error('Server startup failed:', error.message); process.exitCode = 1 })
process.on('SIGINT', async () => { await closeDatabase(); server?.close(() => process.exit(0)) })
process.on('SIGTERM', async () => { await closeDatabase(); server?.close(() => process.exit(0)) })
export default app
