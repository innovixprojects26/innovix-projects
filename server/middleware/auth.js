import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { fail } from '../utils/api.js'

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  if (!token) return fail(res, 'Authentication required', 401)
  try { req.admin = jwt.verify(token, env.jwtSecret); return next() } catch { return fail(res, 'Invalid or expired token', 401) }
}
