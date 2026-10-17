import { env } from './env.js'

export function isStudentOrigin(origin, clientUrl = env.clientUrl, mode = process.env.NODE_ENV) {
  const configured = new URL(clientUrl)
  if (origin === configured.origin) return true
  if (mode === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)) return false
  return ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'].includes(origin)
}
