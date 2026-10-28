import { selectLearningDomain } from '../middleware/learning-domain.js'
import { selectedEnrollment } from '../services/enrollment-selection.js'
import { activeAdminAccessSource, paymentAllowsLearning } from '../services/monthly-enrollment.js'
import { studentHasDomainAccess } from '../services/learning-access.js'

import { loginOnDevice, verifyDevice } from '../services/student-device.js'
import { Router } from 'express'
import { sameInternshipDomain, validLiveClassUrl } from '../../shared/internship-domain.js'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { Student, StudentSession, studentDto } from '../models/student.js'
import {
  checkStudentOrigin,
  csrfFor,
  hashToken,
  requireStudent,
  requireStudentCsrf,
  studentCookieName,
  studentCookieOptions
} from '../middleware/student-auth.js'
import { fail, respond, validateEmail } from '../utils/api.js'
import { normalizePhone } from '../../shared/phone.js'
import { passwordError, studentDomains, studyYears } from '../../shared/student.js'
import { getConfig, getDomain } from '../models/management.js'
import { resetEmailConfigured, sendStudentResetEmail, sendStudentDeviceEmail } from '../services/student-reset-email.js'

const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12)
const invalidCredentials = 'Invalid email or password.'
const normalizeEmail = value =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''
const validEmail = value =>
  value.length <= 254 && validateEmail(value)

function limiter(limit, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    limit,
    windowMs,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many attempts. Please try again later.'
    }
  })
}

export function createStudentRouter({
  emailConfigured = resetEmailConfigured,
  sendResetEmail = sendStudentResetEmail,
  sendDeviceEmail = sendStudentDeviceEmail
} = {}) {
  const router = Router()

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.post(
    '/register',
    limiter(10, 60 * 60 * 1000),
    checkStudentOrigin,
    async (req, res) => {
      const body = req.body || {}
      const email = normalizeEmail(body.email)

      if (!validEmail(email)) {
        return fail(res, 'Enter a valid email address.')
      }

      const validation = passwordError(
        body.password,
        body.confirmPassword
      )
      if (validation) return fail(res, validation)

      const payload = { email }

      for (const [field, max] of Object.entries({
        fullName: 120,
        college: 180,
        course: 120,
        yearOfStudy: 40,
        internshipDomain: 100
      })) {
        if (
          typeof body[field] !== 'string' ||
          !body[field].trim() ||
          body[field].trim().length > max
        ) {
          return fail(res, `Enter a valid ${field}.`)
        }

        payload[field] = body[field].trim()
      }

      if (
        !studentDomains.includes(payload.internshipDomain) ||
        payload.internshipDomain === 'AI Tools' ||
        !studyYears.includes(payload.yearOfStudy)
      ) {
        return fail(
          res,
          'Choose a valid internship domain and year of study.'
        )
      }

      try {
        payload.phone = normalizePhone(
          body.phoneCountry,
          body.phone,
          true
        ).phoneInternational
      } catch (error) {
        return fail(res, error.message)
      }

      if (await Student.exists({ email })) {
        return fail(
          res,
          'An account with this email already exists. Please log in.',
          409
        )
      }

      payload.passwordHash = await bcrypt.hash(body.password, 12)

      try {
        const student = await Student.create(payload)

        return respond(res, {
          student: studentDto(student),
          message: 'Account created. Please log in.'
        }, 201)
      } catch (error) {
        if (error.code === 11000) {
          return fail(
            res,
            'An account with this email already exists. Please log in.',
            409
          )
        }

        throw error
      }
    }
  )

  router.post(
    '/login',
    limiter(20),
    checkStudentOrigin,
    async (req, res) => {
      const { password, rememberMe = false } = req.body || {}
      const email = normalizeEmail(req.body?.email)

      if (
        !validEmail(email) ||
        typeof password !== 'string' ||
        !password ||
        password.length > 72 ||
        typeof rememberMe !== 'boolean'
      ) {
        return fail(res, invalidCredentials, 401)
      }

      const student = await Student.findOne({ email })
        .select('+passwordHash +authVersion +trustedDeviceHash')

      const matches = await bcrypt.compare(
        password,
        student?.passwordHash || await dummyHash
      )

      if (
        !matches ||
        !student ||
        student.accountStatus !== 'active'
      ) {
        return fail(res, invalidCredentials, 401)
      }

      return loginOnDevice(req, res, student, { emailConfigured, sendDeviceEmail })
    }
  )
  router.post('/login/verify-device', limiter(20), checkStudentOrigin, verifyDevice)

  router.get('/me', requireStudent, (req, res) =>
    respond(res, {
      student: studentDto(req.student),
      csrfToken: csrfFor(req.studentToken),
      expiresAt: req.studentSession.expiresAt
    })
  )

  // PAYMENT-VERIFIED STUDENT DASHBOARD
  router.get('/dashboard', requireStudent, selectLearningDomain, async (req, res) => {
    const track = await getDomain(req.student.internshipDomain)
    const { settings } = await getConfig()

    const enrollment = settings.batchesEnabled ? await selectedEnrollment(req.student) : null

    const hasEnrollment = Boolean(
      enrollment?.batch?.enabled &&
      sameInternshipDomain(
        enrollment.batch.domain,
        req.student.internshipDomain
      ) &&
      !['Draft', 'Cancelled'].includes(enrollment.batch.status)
    )

    // The server verifies payment or the selected admin-approved grant.
    const paymentVerified = paymentAllowsLearning(enrollment)
    const accessSource = activeAdminAccessSource(enrollment)
    const accessLabel = accessSource === 'ADMIN_FREE_ACCESS'
      ? 'Admin Approved — Free Access'
      : accessSource === 'ADMIN_CUSTOM_PAYMENT'
        ? 'Admin Approved — Custom Payment'
        : accessSource === 'ADMIN_OFFLINE_PAYMENT'
          ? 'Admin Approved — Offline Payment'
          : paymentVerified ? 'Payment Verified' : 'Payment Pending'
    const hasDomainAccess = await studentHasDomainAccess(req.student, enrollment)

    const liveClassAllowed = Boolean(
      hasDomainAccess &&
      track.liveClassEnabled &&
      track.classActive &&
      validLiveClassUrl(track.meetingUrl)
    )

    return respond(res, {
      student: studentDto(req.student),

      paymentVerified,
      hasDomainAccess,
      accessLabel,

      internshipStatus: hasDomainAccess
        ? `${accessLabel} — Classes Unlocked`
        : paymentVerified ? 'Payment verified - access unavailable' : hasEnrollment
          ? 'Payment Required'
          : 'Account registered',

      internshipStatusNote: hasDomainAccess
        ? `${accessLabel}. Your internship classes are unlocked.`
        : paymentVerified ? 'Contact Admin to check your batch and domain availability.' : hasEnrollment
          ? 'Complete payment to unlock your internship classes.'
          : 'Select your internship domain to enroll automatically and continue to payment.',

      liveClassUrl: liveClassAllowed
        ? track.meetingUrl
        : null,

      liveClass: liveClassAllowed
        ? {
            title: track.classTitle,
            date: track.date,
            startTime: track.startTime,
            description: track.description
          }
        : null,

      recordedClassesAvailable: Boolean(
        hasDomainAccess &&
        track.recordedClassesEnabled
      ),

      learningProgress: null
    })
  })

  router.post(
    '/logout',
    checkStudentOrigin,
    requireStudent,
    requireStudentCsrf,
    async (req, res) => {
      await StudentSession.deleteOne({
        _id: req.studentSession._id
      })

      res.clearCookie(
        studentCookieName(),
        studentCookieOptions()
      )

      return respond(res, {
        message: 'Logged out.'
      })
    }
  )

  router.post(
    '/forgot-password',
    limiter(5, 60 * 60 * 1000),
    checkStudentOrigin,
    async (req, res) => {
      const email = normalizeEmail(req.body?.email)

      if (!validEmail(email)) {
        return fail(res, 'Enter a valid email address.')
      }

      if (!emailConfigured()) {
        return fail(
          res,
          'Password reset email is not configured yet. Please contact Innovix Projects support.',
          503
        )
      }

      const student = await Student.findOne({
        email,
        accountStatus: 'active'
      })

      if (student) {
        const token = randomBytes(32).toString('hex')
        const resetTokenHash = hashToken(token)

        await Student.updateOne(
          { _id: student._id },
          {
            $set: {
              resetTokenHash,
              resetExpiresAt: new Date(
                Date.now() + 30 * 60 * 1000
              )
            }
          }
        )

        try {
          await sendResetEmail(email, token)
        } catch {
          await Student.updateOne(
            {
              _id: student._id,
              resetTokenHash
            },
            {
              $unset: {
                resetTokenHash: 1,
                resetExpiresAt: 1
              }
            }
          )

          return fail(
            res,
            'Password reset email is temporarily unavailable. Please try again later or contact support.',
            503
          )
        }
      }

      return respond(res, {
        message:
          'If an active account matches that email, a password reset link has been requested. Check your inbox and spam folder.'
      })
    }
  )

  router.post(
    '/reset-password',
    limiter(10),
    checkStudentOrigin,
    async (req, res) => {
      const { token, password, confirmPassword } =
        req.body || {}

      if (
        typeof token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(token)
      ) {
        return fail(
          res,
          'This reset link is invalid or expired.'
        )
      }

      const validation = passwordError(
        password,
        confirmPassword
      )

      if (validation) return fail(res, validation)

      const query = {
        resetTokenHash: hashToken(token),
        resetExpiresAt: { $gt: new Date() },
        accountStatus: 'active'
      }

      if (!await Student.exists(query)) {
        return fail(
          res,
          'This reset link is invalid or expired.'
        )
      }

      const passwordHash = await bcrypt.hash(password, 12)

      const student = await Student.findOneAndUpdate(
        query,
        {
          $set: { passwordHash },
          $inc: { authVersion: 1 },
          $unset: {
            resetTokenHash: 1,
            resetExpiresAt: 1
          }
        },
        { returnDocument: 'after' }
      )

      if (!student) {
        return fail(
          res,
          'This reset link is invalid or expired.'
        )
      }

      await StudentSession.deleteMany({
        student: student._id
      })

      res.clearCookie(
        studentCookieName(),
        studentCookieOptions()
      )

      return respond(res, {
        message:
          'Password updated. Please log in with your new password.'
      })
    }
  )

  // Keep raw errors and authentication inputs out of the shared request logger.
  router.use((_error, _req, res, _next) =>
    fail(
      res,
      'Student service is temporarily unavailable. Please try again.',
      500
    )
  )

  return router
}

export default createStudentRouter()
