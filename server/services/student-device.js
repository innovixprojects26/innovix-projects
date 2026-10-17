import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { Student, StudentSession, studentDto } from '../models/student.js'
import { hashToken, csrfFor, studentCookieName, studentCookieOptions } from '../middleware/student-auth.js'
import { fail, respond } from '../utils/api.js'

export const deviceCookieName = () => studentCookieOptions().secure ? '__Host-innovix_device' : 'innovix_device'
function readDevice(req) {
  const value = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${deviceCookieName()}=`))?.split('=')[1]
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null
}
const codeHash = (id, code) => createHmac('sha256', env.jwtSecret).update(`device:${id}:${code}`).digest('hex')

async function issueSession(student, deviceHash, rememberMe, res) {
  const token = randomBytes(32).toString('hex'), tokenHash = hashToken(token)
  const lifetime = (rememberMe ? 30 * 24 : 12) * 60 * 60 * 1000
  const expiresAt = new Date(Date.now() + lifetime)
  await StudentSession.create({ tokenHash, student: student._id, authVersion: student.authVersion, expiresAt })
  // A single atomic pointer means concurrent logins can never leave two usable sessions.
  const updated = await Student.updateOne({ _id: student._id, accountStatus: 'active', authVersion: student.authVersion }, { $set: { activeSessionHash: tokenHash, trustedDeviceHash: deviceHash } })
  if (!updated.matchedCount) return fail(res, 'Your account changed. Please log in again.', 401)
  res.cookie(studentCookieName(), token, { ...studentCookieOptions(), ...(rememberMe ? { maxAge: lifetime } : {}) })
  return respond(res, { student: studentDto(student), csrfToken: csrfFor(token), expiresAt })
}

export async function loginOnDevice(req, res, student, { emailConfigured, sendDeviceEmail }) {
  const device = readDevice(req) || randomBytes(32).toString('hex')
  const deviceHash = hashToken(device)
  res.cookie(deviceCookieName(), device, { ...studentCookieOptions(), maxAge: 365 * 24 * 60 * 60 * 1000 })
  if (!student.trustedDeviceHash) {
    // Only one first browser can claim the account, even with concurrent requests.
    const claimed = await Student.updateOne({ _id: student._id, authVersion: student.authVersion, trustedDeviceHash: { $exists: false } }, { $set: { trustedDeviceHash: deviceHash } })
    if (claimed.matchedCount) return issueSession(student, deviceHash, req.body.rememberMe === true, res)
    student = await Student.findById(student._id).select('+authVersion +trustedDeviceHash')
  }
  if (student.trustedDeviceHash === deviceHash) return issueSession(student, deviceHash, req.body.rememberMe === true, res)
  if (!emailConfigured()) return fail(res, 'New-device verification email is unavailable. Contact support; your current device remains signed in.', 503)
  const id = randomBytes(24).toString('hex'), code = String(randomInt(100000, 1000000))
  const challenge = { id, codeHash: codeHash(id, code), deviceHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0, rememberMe: req.body.rememberMe === true, authVersion: student.authVersion }
  const saved = await Student.updateOne({ _id: student._id, authVersion: student.authVersion, accountStatus: 'active' }, { $set: { loginChallenge: challenge } })
  if (!saved.matchedCount) return fail(res, 'Please log in again.', 401)
  try { await sendDeviceEmail(student.email, code) }
  catch {
    await Student.updateOne({ _id: student._id, 'loginChallenge.id': id }, { $unset: { loginChallenge: 1 } })
    return fail(res, 'Verification email could not be delivered. Please retry login.', 503)
  }
  return respond(res, { requiresOtp: true, challengeId: id, message: 'Enter the six-digit code sent to your email. It expires in 10 minutes.' })
}

export async function verifyDevice(req, res) {
  const { challengeId, code } = req.body || {}, device = readDevice(req)
  if (!device || !/^[a-f0-9]{48}$/.test(challengeId || '') || !/^\d{6}$/.test(code || '')) return fail(res, 'Enter a valid verification code.', 400)
  const student = await Student.findOneAndUpdate({ 'loginChallenge.id': challengeId, 'loginChallenge.deviceHash': hashToken(device), 'loginChallenge.expiresAt': { $gt: new Date() }, 'loginChallenge.attempts': { $lt: 5 }, accountStatus: 'active' }, { $inc: { 'loginChallenge.attempts': 1 } }, { returnDocument: 'after' }).select('+authVersion +loginChallenge')
  const challenge = student?.loginChallenge
  if (!challenge || challenge.authVersion !== student.authVersion || !timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(codeHash(challengeId, code), 'hex'))) return fail(res, 'Invalid or expired code. After five attempts, log in again to request a new code.', 401)
  const consumed = await Student.updateOne({ _id: student._id, authVersion: student.authVersion, 'loginChallenge.id': challengeId, 'loginChallenge.attempts': { $lte: 5 }, 'loginChallenge.expiresAt': { $gt: new Date() } }, { $unset: { loginChallenge: 1 } })
  if (!consumed.modifiedCount) return fail(res, 'This code was already used or expired. Please log in again.', 401)
  return issueSession(student, hashToken(device), challenge.rememberMe, res)
}
