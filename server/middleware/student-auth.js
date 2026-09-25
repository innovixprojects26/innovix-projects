import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Student, StudentSession } from '../models/student.js'
import { env } from '../config/env.js'
import { fail } from '../utils/api.js'

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')
export function studentCookieOptions() {
  const sameSite = (process.env.STUDENT_COOKIE_SAME_SITE || 'lax').toLowerCase()
  if (!['lax', 'strict', 'none'].includes(sameSite)) throw new Error('STUDENT_COOKIE_SAME_SITE must be lax, strict or none')
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none'
  return { httpOnly: true, secure, sameSite, path: '/' }
}
export const studentCookieName = () => studentCookieOptions().secure ? '__Host-innovix_student' : 'innovix_student'
export function readStudentToken(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${studentCookieName()}=`))
  const token = cookie?.slice(cookie.indexOf('=') + 1)
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null
}
export const csrfFor = (token) => createHmac('sha256', env.jwtSecret).update(`student-csrf:${token}`).digest('hex')
export function checkStudentOrigin(req, res, next) {
  const allowedOrigin = new URL(env.clientUrl).origin
  if (req.headers.origin !== allowedOrigin) return fail(res, 'This request did not come from the configured student website.', 403)
  if (!req.is('application/json')) return fail(res, 'Use an application/json request.', 415)
  next()
}
export async function loadStudentSession(req) {
  const token = readStudentToken(req)
  if (!token) return null
  const session = await StudentSession.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean()
  if (!session) return null
  const student = await Student.findById(session.student).select('+authVersion')
  if (!student || student.accountStatus !== 'active' || student.authVersion !== session.authVersion) return null
  req.student = student
  req.studentSession = session
  req.studentToken = token
  return student
}
export async function requireStudent(req, res, next) {
  res.set('Cache-Control', 'no-store')
  if (!await loadStudentSession(req)) return fail(res, 'Please log in to your student account.', 401)
  next()
}
export function requireStudentCsrf(req, res, next) {
  const supplied = req.headers['x-csrf-token']
  const expected = csrfFor(req.studentToken)
  if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return fail(res, 'Session verification failed. Refresh and try again.', 403)
  next()
}
export function requireContentCreationStudent(req, res, next) {
  if (req.student.internshipDomain !== 'Content Creation') return fail(res, 'These recorded classes are for Content Creation students.', 403)
  next()
}
