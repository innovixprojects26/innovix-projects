import dns from 'node:dns'
import 'dotenv/config'

if (process.env.NODE_ENV !== 'production') dns.setServers(['1.1.1.1', '8.8.8.8'])

export const env = {
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
}

export function validateRequiredEnv({ requireMongo = false, requireAdmin = false } = {}) {
  const missing = []
  if (requireMongo && !env.mongoUri) throw new Error('MongoDB Atlas connection string is required.')
  if (!env.jwtSecret) missing.push('JWT_SECRET')
  if (requireAdmin && !env.adminEmail) missing.push('ADMIN_EMAIL')
  if (requireAdmin && !env.adminInitialPassword) missing.push('ADMIN_INITIAL_PASSWORD')
  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) missing.push('CLIENT_URL')
  if (!Number.isInteger(env.trustProxyHops) || env.trustProxyHops < 0) throw new Error('TRUST_PROXY_HOPS must be a non-negative integer')
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
}
