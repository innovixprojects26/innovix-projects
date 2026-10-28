import mongoose from 'mongoose'
import { internshipIndicators } from '../services/internship-indicators.js'
import { normalizeInternshipDomain } from '../../shared/internship-domain.js'
import { WebsiteConfig, InternshipDomain, Announcement, AdminActivity, getConfig, ensureDomains, settingDefaults, homepageDefaults } from '../models/management.js'
import { Student, StudentSession, studentDto } from '../models/student.js'
import { BatchEnrollment } from '../models/learning.js'
import { Admin } from '../models/index.js'
import { fail, respond, validateEmail, validateUrl } from '../utils/api.js'
import { studentDomains } from '../../shared/student.js'
import { activeAdminAccessSource, ensureMonthlyEnrollment, hasActiveAdminAccessGrant, hasActiveOfflinePaymentGrant, paidEnrollment, paymentAllowsLearning } from '../services/monthly-enrollment.js'
import { sameInternshipDomain } from '../../shared/internship-domain.js'

export async function publicConfiguration(_req, res) {
  if (process.env.RUN_STARTUP_INITIALIZATION === 'true') await ensureDomains()

  const now = new Date()

  const [config, domains, announcements, indicators] = await Promise.all([
    getConfig(),

    InternshipDomain.find({
      active: true,
      name: { $in: studentDomains }
    }).lean(),

    Announcement.find({
      active: true,
      $and: [
        {
          $or: [
            { startDate: null },
            { startDate: { $lte: now } }
          ]
        },
        {
          $or: [
            { endDate: null },
            { endDate: { $gte: now } }
          ]
        }
      ]
    })
      .sort({ createdAt: -1 })
      .lean(),
    internshipIndicators()
  ])

  res.set('Cache-Control', 'no-store')

  return respond(res, {
    ...config,

    services: config.services.filter(
      item => item.active !== false
    ),

    domains: domains.map(item => ({
      ...item,
      enrollmentCount: indicators[normalizeInternshipDomain(item.name)]?.enrollmentCount ?? 0,

      // Meeting URLs are returned only by the authorized student dashboard.
      meetingUrl: ''
    })),

    announcements
  })
}
export async function readConfig(_req, res) { res.set('Cache-Control', 'no-store'); return respond(res, await getConfig()) }
export async function saveConfig(req, res) {
  const { section } = req.params
  if (!['settings', 'homepage', 'services'].includes(section)) return fail(res, 'Unknown settings section', 404)
  const value = req.body
  if (!value || typeof value !== 'object' || (section !== 'services' && Array.isArray(value))) return fail(res, 'Invalid settings payload')
  if (section === 'services') {
    if (!Array.isArray(value) || value.length > 30 || value.some(item => !item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160 || typeof item.description !== 'string' || item.description.length > 2000 || typeof item.active !== 'boolean')) return fail(res, 'Enter valid service titles, descriptions and active states.')
    await WebsiteConfig.updateOne({ _id: 'website' }, { $set: { services: value.map(({ title, description, active }) => ({ title: title.trim(), description: description.trim(), active })) } }, { upsert: true, runValidators: true })
  } else {
    const defaults = section === 'settings' ? settingDefaults : homepageDefaults
    const update = {}
    for (const [key, input] of Object.entries(value)) {
      if (!Object.hasOwn(defaults, key)) return fail(res, 'Unknown setting')
      if (typeof input !== typeof defaults[key] || (typeof input === 'string' && input.length > 2000)) return fail(res, 'Invalid setting value')
      if (key === 'discoverPublishingMode' && !['manual', 'auto'].includes(input)) return fail(res, 'Choose Manual Approval or Auto Publish Trusted Sources.')
      if (key.endsWith('Url') && !validateUrl(input)) return fail(res, 'Social links must use http(s).')
      if (key === 'supportEmail' && !validateEmail(input)) return fail(res, 'Enter a valid support email.')
      if (key === 'whatsapp' && !/^\d{7,15}$/.test(input)) return fail(res, 'WhatsApp number must contain 7–15 digits including country code.')
      update[`${section}.${key}`] = typeof input === 'string' ? input.trim() : input
    }
    await WebsiteConfig.updateOne({ _id: 'website' }, { $set: update }, { upsert: true, runValidators: true })
  }
  return respond(res, await getConfig())
}
export async function listDomains(_req, res) { if (process.env.RUN_STARTUP_INITIALIZATION === 'true') await ensureDomains(); return respond(res, await InternshipDomain.find({ name: { $in: studentDomains } }).sort({ name: 1 }).lean()) }
export async function updateDomain(req, res) {
  const item = await InternshipDomain.findById(req.params.id)
  if (!item || !studentDomains.includes(item.name)) return fail(res, 'Internship not found', 404)
  if ('price' in req.body) {
    if (typeof req.body.price !== 'number' || !Number.isFinite(req.body.price) || req.body.price < 0 || req.body.price > 1000000 || Math.abs(Math.round(req.body.price * 100) - req.body.price * 100) > 0.000001) return fail(res, 'Enter a valid internship price with at most two decimal places.')
    item.price = req.body.price
  }
  for (const key of ['active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled', 'classActive', 'classTitle', 'meetingUrl', 'date', 'startTime', 'description']) {
    if (!(key in req.body)) continue
    const value = req.body[key]
    const boolean = ['active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled', 'classActive'].includes(key)
    if (typeof value !== (boolean ? 'boolean' : 'string') || (!boolean && value.length > 2000)) return fail(res, 'Invalid internship setting')
    if (key === 'meetingUrl' && !validateUrl(value)) return fail(res, 'Meeting URL must use http(s).')
    if (key === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) return fail(res, 'Enter a valid class date.')
    if (key === 'startTime' && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fail(res, 'Enter a valid start time.')
    item.set(key, value)
  }
  await item.save()
  return respond(res, item)
}
export async function students(req, res) {
  const query = {}
  if (['active', 'suspended'].includes(req.query.status)) query.accountStatus = req.query.status
  if (typeof req.query.domain === 'string' && req.query.domain) query.internshipDomain = req.query.domain
  if (typeof req.query.search === 'string' && req.query.search) {
    const escaped = req.query.search.slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.$or = ['fullName', 'email', 'studentId', 'college'].map(key => ({ [key]: { $regex: escaped, $options: 'i' } }))
  }
  const items = await Student.find(query).sort({ createdAt: -1 }).lean()
  return respond(res, items.map(item => ({ _id: item._id, ...studentDto(item) })))
}

function offlinePaymentView(payment) {
  return {
    _id: payment._id,
    accessSource: payment.accessSource,
    status: payment.status,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    method: payment.method,
    transactionReference: payment.transactionReference || '',
    paymentDate: payment.paymentDate,
    student: payment.student,
    studentName: payment.studentName,
    studentEmail: payment.studentEmail,
    internship: payment.internship,
    internshipTitle: payment.internshipTitle,
    approvedBy: payment.approvedBy,
    approvedAdminEmail: payment.approvedAdminEmail,
    confirmedAt: payment.confirmedAt,
    createdAt: payment.createdAt,
    internalNote: payment.internalNote || ''
  }
}

function offlineEnrollmentView(item) {
  const onlinePaymentVerified = paymentAllowsLearning(item) && !hasActiveOfflinePaymentGrant(item) && !hasActiveAdminAccessGrant(item)
  return {
    _id: item._id,
    domain: item.batch?.domain || item.domain || '',
    batchName: item.batch?.name || '',
    status: item.status,
    batchEnabled: item.batch?.enabled === true,
    batchStatus: item.batch?.status || '',
    onlinePaymentVerified,
    activeAdminAccessSource: activeAdminAccessSource(item),
    razorpayStatus: item.livePayment?.status || item.testPayment?.status || item.paymentStatus || 'Not Paid',
    razorpayOrderId: item.livePayment?.orderId || '',
    offlineGrant: item.offlineAccessGrant ? {
      accessSource: item.offlineAccessGrant.accessSource,
      active: item.offlineAccessGrant.active === true,
      paymentRecordId: item.offlineAccessGrant.paymentRecordId,
      internship: item.offlineAccessGrant.internship,
      grantedBy: item.offlineAccessGrant.grantedBy,
      grantedAt: item.offlineAccessGrant.grantedAt,
      revokedBy: item.offlineAccessGrant.revokedBy,
      revokedAt: item.offlineAccessGrant.revokedAt,
      revokeReason: item.offlineAccessGrant.revokeReason || ''
    } : null,
    offlinePayments: (item.offlinePayments || []).map(offlinePaymentView),
    customPayments: (item.customAdminPayments || []).map(customPaymentView),
    adminAccessGrants: item.adminAccessGrants || [],
    auditHistory: item.offlineAccessEvents || []
  }
}

function customPaymentView(payment) {
  return {
    _id: payment._id,
    accessSource: payment.accessSource,
    status: payment.status,
    agreedAmountPaise: payment.agreedAmountPaise,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    method: payment.method || '',
    transactionReference: payment.transactionReference || '',
    paymentDate: payment.paymentDate,
    student: payment.student,
    studentName: payment.studentName,
    studentEmail: payment.studentEmail,
    internship: payment.internship,
    internshipTitle: payment.internshipTitle,
    approvedBy: payment.approvedBy,
    approvedAdminEmail: payment.approvedAdminEmail,
    confirmedBy: payment.confirmedBy,
    confirmedAdminEmail: payment.confirmedAdminEmail || '',
    confirmedAt: payment.confirmedAt,
    createdAt: payment.createdAt,
    internalNote: payment.internalNote || ''
  }
}

async function authorizedOfflineAdmin(req) {
  if (!mongoose.isObjectIdOrHexString(req.admin?.id)) return null
  const admin = await Admin.findById(req.admin.id).select('_id email role').lean()
  return admin && ['admin', 'superadmin'].includes(admin.role) ? admin : null
}

export async function studentOfflineAccess(req, res) {
  const admin = await authorizedOfflineAdmin(req)
  if (!admin) return fail(res, 'Authorized admin access is required.', 403)
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Student not found.', 404)
  const student = await Student.findById(req.params.id).select('studentId fullName email internshipDomain accountStatus createdAt').lean()
  if (!student) return fail(res, 'Student not found.', 404)
  const [domains, enrollments] = await Promise.all([
    InternshipDomain.find({ name: { $in: studentDomains }, active: true }).select('name active _id').sort({ name: 1 }).lean(),
    BatchEnrollment.find({ student: student._id }).sort({ createdAt: -1, _id: -1 }).populate('batch', 'name domain enabled status').select('+offlinePayments.internalNote +customAdminPayments.internalNote').lean()
  ])
  return respond(res, {
    student: { _id: student._id, ...studentDto(student) },
    domains,
    enrollments: enrollments.map(offlineEnrollmentView)
  })
}

export async function confirmOfflinePayment(req, res) {
  const admin = await authorizedOfflineAdmin(req)
  if (!admin) return fail(res, 'Authorized admin access is required.', 403)
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Student not found.', 404)
  const student = await Student.findById(req.params.id)
  if (!student) return fail(res, 'Student not found.', 404)
  if (student.accountStatus !== 'active') return fail(res, 'Offline payment access requires an active student account.', 409)

  const domainName = typeof req.body?.domain === 'string' ? req.body.domain.trim() : ''
  const domain = studentDomains.includes(domainName)
    ? await InternshipDomain.findOne({ name: domainName }).lean()
    : null
  if (!domain || !domain.active || domain.name === 'AI Tools') return fail(res, 'Choose an active eligible internship.', 400)

  const method = req.body?.method
  if (!['UPI', 'Bank Transfer', 'Cash'].includes(method)) return fail(res, 'Choose UPI, Bank Transfer or Cash.', 400)
  const amountText = String(req.body?.amountRupees ?? '').trim()
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(amountText)) return fail(res, 'Enter the actual amount received in rupees, with at most two decimal places.', 400)
  const amountPaise = Math.round(Number(amountText) * 100)
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || amountPaise > 100000000) return fail(res, 'Amount must be between ₹0.01 and ₹1,000,000.', 400)

  const transactionReference = typeof req.body?.transactionReference === 'string' ? req.body.transactionReference.trim() : ''
  if (transactionReference.length > 160) return fail(res, 'Transaction reference is too long.', 400)
  if (method !== 'Cash' && !transactionReference) return fail(res, 'A transaction reference is required for UPI and bank transfers.', 400)
  if (typeof req.body?.paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(req.body.paymentDate)) return fail(res, 'Enter a valid payment date.', 400)
  const paymentDate = new Date(`${req.body.paymentDate}T12:00:00.000+05:30`)
  if (Number.isNaN(paymentDate.getTime()) || paymentDate.toISOString().slice(0, 10) !== req.body.paymentDate || paymentDate.getTime() > Date.now()) return fail(res, 'Payment date must be valid and cannot be in the future.', 400)
  if (req.body?.confirmReceived !== true) return fail(res, 'Confirm that the payment was actually received and verified.', 400)
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : ''
  if (!/^[a-f0-9-]{16,80}$/i.test(idempotencyKey)) return fail(res, 'A valid request id is required.', 400)
  const internalNote = typeof req.body?.internalNote === 'string' ? req.body.internalNote.trim() : ''
  if (internalNote.length > 1000) return fail(res, 'Internal note is too long.', 400)

  const duplicate = await BatchEnrollment.findOne({ 'offlinePayments.idempotencyKey': idempotencyKey }).populate('batch', 'name domain enabled status').select('+offlinePayments.internalNote').lean()
  if (duplicate) {
    const payment = (duplicate.offlinePayments || []).find(item => item.idempotencyKey === idempotencyKey)
    if (String(duplicate.student) !== String(student._id) || !sameInternshipDomain(duplicate.batch?.domain || duplicate.domain, domain.name)) return fail(res, 'Request id was already used for another student or internship.', 409)
    return respond(res, { enrollment: offlineEnrollmentView(duplicate), payment: payment ? offlinePaymentView(payment) : null, duplicate: true })
  }

  const referenceExists = transactionReference && await BatchEnrollment.exists({ 'offlinePayments.transactionReference': transactionReference })
  if (referenceExists) return fail(res, 'This transaction reference is already recorded. Review the existing payment history.', 409)

  const { enrollment } = await ensureMonthlyEnrollment(student, domain.name)
  if (!enrollment || !['Enrolled', 'Completed'].includes(enrollment.status) || !enrollment.batch?.enabled || ['Draft', 'Cancelled'].includes(enrollment.batch?.status) || !sameInternshipDomain(enrollment.batch?.domain, domain.name)) return fail(res, 'A valid active enrollment for this internship could not be confirmed.', 409)
  if (paymentAllowsLearning(enrollment) || paidEnrollment(enrollment)) return fail(res, 'This internship already has verified payment access. No offline payment was recorded.', 409)
  if (hasActiveOfflinePaymentGrant(enrollment)) return fail(res, 'Admin offline access is already active for this internship.', 409)

  const paymentRecordId = new mongoose.Types.ObjectId()
  const now = new Date()
  const payment = {
    _id: paymentRecordId,
    accessSource: 'ADMIN_OFFLINE_PAYMENT',
    status: 'Admin Verified',
    amountPaise,
    currency: 'INR',
    method,
    transactionReference,
    paymentDate,
    student: student._id,
    internship: domain._id,
    studentName: student.fullName,
    studentEmail: student.email,
    internshipTitle: domain.name,
    approvedBy: admin._id,
    approvedAdminEmail: admin.email,
    confirmedAt: now,
    idempotencyKey,
    internalNote
  }
  const eventBase = { admin: admin._id, student: student._id, internship: domain._id, paymentRecordId, amountPaise, occurredAt: now }
  const events = [
    { ...eventBase, action: 'OFFLINE_PAYMENT_CONFIRMED', reason: 'Admin confirmed receipt of offline payment.' },
    { ...eventBase, action: 'ACCESS_GRANTED', reason: 'Admin offline-payment access granted for the selected internship.' },
  ]
  const updated = await BatchEnrollment.findOneAndUpdate({
    _id: enrollment._id,
    student: student._id,
    status: { $in: ['Enrolled', 'Completed'] },
    paymentStatus: { $nin: ['Paid', 'PAID'] },
    'livePayment.status': { $ne: 'Paid' },
    'testPayment.status': { $ne: 'Paid' },
    'offlineAccessGrant.active': { $ne: true },
    'offlinePayments.idempotencyKey': { $ne: idempotencyKey }
  }, {
    $push: { offlinePayments: payment, offlineAccessEvents: { $each: events } },
    $set: { offlineAccessGrant: { accessSource: 'ADMIN_OFFLINE_PAYMENT', internship: domain._id, paymentRecordId, active: true, grantedBy: admin._id, grantedAt: now } }
  }, { returnDocument: 'after', runValidators: true }).populate('batch', 'name domain enabled status').select('+offlinePayments.internalNote').lean()

  if (!updated) {
    const replay = await BatchEnrollment.findOne({ student: student._id, 'offlinePayments.idempotencyKey': idempotencyKey }).populate('batch', 'name domain enabled status').select('+offlinePayments.internalNote').lean()
    if (replay) {
      const saved = replay.offlinePayments.find(item => item.idempotencyKey === idempotencyKey)
      return respond(res, { enrollment: offlineEnrollmentView(replay), payment: saved ? offlinePaymentView(saved) : null, duplicate: true })
    }
    return fail(res, 'Enrollment or payment status changed. Refresh and review payment history before retrying.', 409)
  }
  const savedPayment = updated.offlinePayments.find(item => String(item._id) === String(paymentRecordId))
  return respond(res, { enrollment: offlineEnrollmentView(updated), payment: savedPayment ? offlinePaymentView(savedPayment) : null, duplicate: false }, 201)
}

export async function revokeOfflinePaymentAccess(req, res) {
  const admin = await authorizedOfflineAdmin(req)
  if (!admin) return fail(res, 'Authorized admin access is required.', 403)
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !mongoose.isObjectIdOrHexString(req.params.enrollmentId)) return fail(res, 'Student or enrollment not found.', 404)
  if (req.body?.confirmRevoke !== true) return fail(res, 'Confirm that only the admin-granted access should be revoked.', 400)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 3 || reason.length > 500) return fail(res, 'Enter a revocation reason between 3 and 500 characters.', 400)
  const current = await BatchEnrollment.findOne({ _id: req.params.enrollmentId, student: req.params.id }).populate('batch', 'domain').lean()
  if (!current) return fail(res, 'Student enrollment not found.', 404)
  const grant = current.offlineAccessGrant
  if (grant?.accessSource !== 'ADMIN_OFFLINE_PAYMENT' || grant.active !== true) return fail(res, 'No active admin offline-payment grant exists for this internship.', 409)
  const payment = (current.offlinePayments || []).find(item => String(item._id) === String(grant.paymentRecordId))
  if (!payment || payment.accessSource !== 'ADMIN_OFFLINE_PAYMENT') return fail(res, 'Offline payment history needs administrator review.', 409)
  const now = new Date()
  const event = { action: 'ACCESS_REVOKED', admin: admin._id, student: current.student, internship: grant.internship, paymentRecordId: payment._id, amountPaise: payment.amountPaise, reason, occurredAt: now }
  const updated = await BatchEnrollment.findOneAndUpdate({ _id: current._id, student: current.student, 'offlineAccessGrant.accessSource': 'ADMIN_OFFLINE_PAYMENT', 'offlineAccessGrant.active': true, 'offlineAccessGrant.paymentRecordId': payment._id }, {
    $set: { 'offlineAccessGrant.active': false, 'offlineAccessGrant.revokedBy': admin._id, 'offlineAccessGrant.revokedAt': now, 'offlineAccessGrant.revokeReason': reason },
    $push: { offlineAccessEvents: event }
  }, { returnDocument: 'after', runValidators: true }).populate('batch', 'name domain enabled status').select('+offlinePayments.internalNote').lean()
  if (!updated) return fail(res, 'Access changed before revocation completed. Refresh and review the current status.', 409)
  return respond(res, { enrollment: offlineEnrollmentView(updated), payment: offlinePaymentView(payment) })
}

const validRequestKey = value => typeof value === 'string' && /^[a-f0-9-]{16,80}$/i.test(value.trim())
const amountInPaise = value => {
  const input = String(value ?? '').trim()
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(input)) return null
  const amount = Math.round(Number(input) * 100)
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100000000 ? amount : null
}
function validateCustomPaymentConfirmation(req) {
  const amountPaise = amountInPaise(req.body?.amountRupees)
  const method = req.body?.method
  const transactionReference = typeof req.body?.transactionReference === 'string' ? req.body.transactionReference.trim() : ''
  const paymentDateText = req.body?.paymentDate
  if (!amountPaise) return { error: 'Enter the actual amount received, between ₹0.01 and ₹1,000,000.' }
  if (!['UPI', 'Bank Transfer', 'Cash'].includes(method)) return { error: 'Choose UPI, bank transfer or cash.' }
  if (transactionReference.length > 160 || (method !== 'Cash' && !transactionReference)) return { error: 'A transaction reference is required for UPI and bank transfer.' }
  if (typeof paymentDateText !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDateText)) return { error: 'Enter a valid payment date.' }
  const paymentDate = new Date(`${paymentDateText}T12:00:00.000+05:30`)
  if (Number.isNaN(paymentDate.getTime()) || paymentDate.toISOString().slice(0, 10) !== paymentDateText || paymentDate.getTime() > Date.now()) return { error: 'Payment date must be valid and cannot be in the future.' }
  return { amountPaise, method, transactionReference, paymentDate }
}

async function offlineAccessContext(req, res) {
  const admin = await authorizedOfflineAdmin(req)
  if (!admin) { fail(res, 'Authorized admin access is required.', 403); return null }
  if (!mongoose.isObjectIdOrHexString(req.params.id)) { fail(res, 'Student not found.', 404); return null }
  const student = await Student.findById(req.params.id)
  if (!student) { fail(res, 'Student not found.', 404); return null }
  if (student.accountStatus !== 'active') { fail(res, 'Admin access requires an active student account.', 409); return null }
  const domainName = typeof req.body?.domain === 'string' ? req.body.domain.trim() : ''
  const domain = studentDomains.includes(domainName) ? await InternshipDomain.findOne({ name: domainName, active: true }).lean() : null
  if (!domain || domain.name === 'AI Tools') { fail(res, 'Choose one active eligible internship.', 400); return null }
  return { admin, student, domain }
}

async function existingAdminRequest(req, res, student, domain, idempotencyKey) {
  const item = await BatchEnrollment.findOne({ 'adminAccessGrants.idempotencyKey': idempotencyKey }).populate('batch', 'name domain enabled status').lean()
  if (!item) return null
  if (String(item.student) !== String(student._id) || !sameInternshipDomain(item.batch?.domain || item.domain, domain.name)) {
    fail(res, 'Request id was already used for another student or internship.', 409)
    return { error: true }
  }
  const grant = item.adminAccessGrants.find(row => row.idempotencyKey === idempotencyKey)
  return respond(res, { enrollment: offlineEnrollmentView(item), grant, duplicate: true })
}

export async function grantFreeInternshipAccess(req, res) {
  const context = await offlineAccessContext(req, res)
  if (!context) return
  const { admin, student, domain } = context
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : ''
  if (!validRequestKey(idempotencyKey)) return fail(res, 'A valid request id is required.', 400)
  if (req.body?.confirmGrant !== true) return fail(res, 'Confirm the free-access approval before granting access.', 400)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length > 500) return fail(res, 'Approval reason must be 500 characters or fewer.', 400)
  const duplicate = await existingAdminRequest(req, res, student, domain, idempotencyKey)
  if (duplicate) return duplicate.error ? undefined : duplicate
  const { enrollment } = await ensureMonthlyEnrollment(student, domain.name)
  if (paymentAllowsLearning(enrollment) || paidEnrollment(enrollment) || hasActiveOfflinePaymentGrant(enrollment) || hasActiveAdminAccessGrant(enrollment)) return fail(res, 'This internship already has learning access. No additional grant was created.', 409)
  if ((enrollment.customAdminPayments || []).some(payment => payment.status === 'Pending')) return fail(res, 'A custom-payment agreement is pending for this internship. Resolve it before granting free access.', 409)
  const now = new Date(), grantId = new mongoose.Types.ObjectId()
  const grant = { _id: grantId, accessSource: 'ADMIN_FREE_ACCESS', student: student._id, internship: domain._id, domain: domain.name, active: true, approvedBy: admin._id, approvedAt: now, reason, idempotencyKey }
  const event = { action: 'FREE_ACCESS_GRANTED', accessSource: 'ADMIN_FREE_ACCESS', admin: admin._id, student: student._id, internship: domain._id, accessGrantId: grantId, reason: reason || 'Admin approved free internship access.', occurredAt: now }
  const updated = await BatchEnrollment.findOneAndUpdate({
    _id: enrollment._id, student: student._id, status: { $in: ['Enrolled', 'Completed'] },
    paymentStatus: { $nin: ['Paid', 'PAID'] }, 'livePayment.status': { $ne: 'Paid' }, 'testPayment.status': { $ne: 'Paid' },
    'offlineAccessGrant.active': { $ne: true }, customAdminPayments: { $not: { $elemMatch: { status: 'Pending' } } }, adminAccessGrants: { $not: { $elemMatch: { domain: domain.name, active: true } } },
    'adminAccessGrants.idempotencyKey': { $ne: idempotencyKey }
  }, { $push: { adminAccessGrants: grant, offlineAccessEvents: event } }, { returnDocument: 'after', runValidators: true }).populate('batch', 'name domain enabled status').lean()
  if (!updated) return fail(res, 'Enrollment or access changed. Refresh and review the current access history.', 409)
  return respond(res, { enrollment: offlineEnrollmentView(updated), grant, duplicate: false }, 201)
}

export async function createCustomPaymentAgreement(req, res) {
  const context = await offlineAccessContext(req, res)
  if (!context) return
  const { admin, student, domain } = context
  const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : ''
  if (!validRequestKey(idempotencyKey)) return fail(res, 'A valid request id is required.', 400)
  const agreedAmountPaise = amountInPaise(req.body?.agreedAmountRupees)
  if (!agreedAmountPaise) return fail(res, 'Enter the agreed amount between ₹0.01 and ₹1,000,000.', 400)
  const internalNote = typeof req.body?.internalNote === 'string' ? req.body.internalNote.trim() : ''
  if (internalNote.length > 1000) return fail(res, 'Internal note must be 1,000 characters or fewer.', 400)
  const duplicate = await BatchEnrollment.findOne({ 'customAdminPayments.idempotencyKey': idempotencyKey }).populate('batch', 'name domain enabled status').select('+customAdminPayments.internalNote').lean()
  if (duplicate) {
    if (String(duplicate.student) !== String(student._id) || !sameInternshipDomain(duplicate.batch?.domain || duplicate.domain, domain.name)) return fail(res, 'Request id was already used for another student or internship.', 409)
    return respond(res, { enrollment: offlineEnrollmentView(duplicate), payment: customPaymentView(duplicate.customAdminPayments.find(item => item.idempotencyKey === idempotencyKey)), duplicate: true })
  }
  const { enrollment } = await ensureMonthlyEnrollment(student, domain.name)
  if (paymentAllowsLearning(enrollment) || paidEnrollment(enrollment) || hasActiveOfflinePaymentGrant(enrollment) || hasActiveAdminAccessGrant(enrollment)) return fail(res, 'This internship already has learning access. No custom agreement was recorded.', 409)
  if ((enrollment.customAdminPayments || []).some(payment => payment.status === 'Pending')) return fail(res, 'A custom-payment agreement is already pending for this internship.', 409)
  const paymentId = new mongoose.Types.ObjectId(), now = new Date()
  const payment = { _id: paymentId, accessSource: 'ADMIN_CUSTOM_PAYMENT', status: 'Pending', agreedAmountPaise, currency: 'INR', student: student._id, internship: domain._id, domain: domain.name, studentName: student.fullName, studentEmail: student.email, internshipTitle: domain.name, approvedBy: admin._id, approvedAdminEmail: admin.email, idempotencyKey, internalNote }
  const event = { action: 'CUSTOM_PAYMENT_AGREEMENT_SAVED', accessSource: 'ADMIN_CUSTOM_PAYMENT', admin: admin._id, student: student._id, internship: domain._id, paymentRecordId: paymentId, amountPaise: agreedAmountPaise, reason: 'Custom payment agreement saved; access remains locked until payment is confirmed.', occurredAt: now }
  const updated = await BatchEnrollment.findOneAndUpdate({ _id: enrollment._id, student: student._id, 'customAdminPayments.idempotencyKey': { $ne: idempotencyKey }, customAdminPayments: { $not: { $elemMatch: { status: 'Pending' } } }, 'offlineAccessGrant.active': { $ne: true }, adminAccessGrants: { $not: { $elemMatch: { domain: domain.name, active: true } } } }, { $push: { customAdminPayments: payment, offlineAccessEvents: event } }, { returnDocument: 'after', runValidators: true }).populate('batch', 'name domain enabled status').select('+customAdminPayments.internalNote').lean()
  if (!updated) return fail(res, 'Enrollment or agreement changed. Refresh and review the current status.', 409)
  const saved = updated.customAdminPayments.find(item => String(item._id) === String(paymentId))
  return respond(res, { enrollment: offlineEnrollmentView(updated), payment: customPaymentView(saved), duplicate: false }, 201)
}

export async function confirmCustomPaymentReceived(req, res) {
  const admin = await authorizedOfflineAdmin(req)
  if (!admin) return fail(res, 'Authorized admin access is required.', 403)
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !mongoose.isObjectIdOrHexString(req.params.paymentId)) return fail(res, 'Student or custom payment not found.', 404)
  if (req.body?.confirmReceived !== true) return fail(res, 'Confirm that the agreed payment has actually been received.', 400)
  const confirmation = validateCustomPaymentConfirmation(req)
  if (confirmation.error) return fail(res, confirmation.error, 400)
  const current = await BatchEnrollment.findOne({ student: req.params.id, 'customAdminPayments._id': req.params.paymentId }).populate('batch', 'name domain enabled status').lean()
  if (!current) return fail(res, 'Pending custom payment agreement not found.', 404)
  const payment = current.customAdminPayments.find(item => String(item._id) === String(req.params.paymentId))
  if (payment?.status === 'Admin Verified') return respond(res, { enrollment: offlineEnrollmentView(current), payment: customPaymentView(payment), duplicate: true })
  if (!payment || payment.status !== 'Pending' || String(payment.student) !== String(req.params.id)) return fail(res, 'This custom payment is not pending for the selected student.', 409)
  if (confirmation.amountPaise !== payment.agreedAmountPaise) return fail(res, 'The actual amount received must match the agreed custom amount before access can be granted.', 409)
  if (confirmation.transactionReference && await BatchEnrollment.exists({ $or: [{ 'offlinePayments.transactionReference': confirmation.transactionReference }, { 'customAdminPayments.transactionReference': confirmation.transactionReference }] })) return fail(res, 'This transaction reference is already recorded. Review the existing payment history.', 409)
  if (!['Enrolled', 'Completed'].includes(current.status) || !current.batch?.enabled || ['Draft', 'Cancelled'].includes(current.batch?.status) || !sameInternshipDomain(current.batch?.domain, payment.domain)) return fail(res, 'A valid active enrollment could not be confirmed.', 409)
  if (paymentAllowsLearning(current) || paidEnrollment(current) || hasActiveOfflinePaymentGrant(current) || hasActiveAdminAccessGrant(current)) return fail(res, 'This internship already has learning access. Custom payment confirmation was not recorded.', 409)
  const adminGrantId = new mongoose.Types.ObjectId(), now = new Date()
  const grant = { _id: adminGrantId, accessSource: 'ADMIN_CUSTOM_PAYMENT', student: current.student, internship: payment.internship, domain: payment.domain, active: true, approvedBy: admin._id, approvedAt: now, reason: 'Agreed custom payment received and verified.', customPaymentId: payment._id, idempotencyKey: `custom-${payment.idempotencyKey}` }
  const events = [
    { action: 'CUSTOM_PAYMENT_CONFIRMED', accessSource: 'ADMIN_CUSTOM_PAYMENT', admin: admin._id, student: current.student, internship: payment.internship, paymentRecordId: payment._id, accessGrantId: adminGrantId, amountPaise: confirmation.amountPaise, reason: 'Admin confirmed receipt of the agreed custom payment.', occurredAt: now },
    { action: 'ACCESS_GRANTED', accessSource: 'ADMIN_CUSTOM_PAYMENT', admin: admin._id, student: current.student, internship: payment.internship, paymentRecordId: payment._id, accessGrantId: adminGrantId, amountPaise: confirmation.amountPaise, reason: 'Custom-payment access granted for the selected internship.', occurredAt: now },
  ]
  const updated = await BatchEnrollment.findOneAndUpdate({
    _id: current._id, student: current.student, customAdminPayments: { $elemMatch: { _id: payment._id, status: 'Pending' } },
    status: { $in: ['Enrolled', 'Completed'] }, paymentStatus: { $nin: ['Paid', 'PAID'] }, 'livePayment.status': { $ne: 'Paid' }, 'testPayment.status': { $ne: 'Paid' },
    'offlineAccessGrant.active': { $ne: true }, adminAccessGrants: { $not: { $elemMatch: { domain: payment.domain, active: true } } }
  }, {
    $set: { 'customAdminPayments.$.status': 'Admin Verified', 'customAdminPayments.$.amountPaise': confirmation.amountPaise, 'customAdminPayments.$.method': confirmation.method, 'customAdminPayments.$.transactionReference': confirmation.transactionReference, 'customAdminPayments.$.paymentDate': confirmation.paymentDate, 'customAdminPayments.$.confirmedBy': admin._id, 'customAdminPayments.$.confirmedAdminEmail': admin.email, 'customAdminPayments.$.confirmedAt': now },
    $push: { adminAccessGrants: grant, offlineAccessEvents: { $each: events } }
  }, { returnDocument: 'after', runValidators: true }).populate('batch', 'name domain enabled status').select('+customAdminPayments.internalNote').lean()
  if (!updated) return fail(res, 'Payment or enrollment changed. Refresh and confirm status before retrying.', 409)
  const saved = updated.customAdminPayments.find(item => String(item._id) === String(payment._id))
  return respond(res, { enrollment: offlineEnrollmentView(updated), payment: customPaymentView(saved), grant, duplicate: false }, 200)
}

export async function revokeAdminAccessGrant(req, res) {
  const admin = await authorizedOfflineAdmin(req)
  if (!admin) return fail(res, 'Authorized admin access is required.', 403)
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !mongoose.isObjectIdOrHexString(req.params.grantId)) return fail(res, 'Student or access grant not found.', 404)
  if (req.body?.confirmRevoke !== true) return fail(res, 'Confirm that only this admin-approved access should be revoked.', 400)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 3 || reason.length > 500) return fail(res, 'Enter a revocation reason between 3 and 500 characters.', 400)
  const current = await BatchEnrollment.findOne({ student: req.params.id, 'adminAccessGrants._id': req.params.grantId }).populate('batch', 'domain').lean()
  if (!current) return fail(res, 'Admin access grant not found.', 404)
  const grant = current.adminAccessGrants.find(item => String(item._id) === String(req.params.grantId))
  if (!grant?.active) return fail(res, 'This admin access grant is already revoked.', 409)
  const now = new Date()
  const event = { action: 'ACCESS_REVOKED', accessSource: grant.accessSource, admin: admin._id, student: current.student, internship: grant.internship, paymentRecordId: grant.customPaymentId, accessGrantId: grant._id, reason, occurredAt: now }
  const updated = await BatchEnrollment.findOneAndUpdate({ _id: current._id, student: current.student, adminAccessGrants: { $elemMatch: { _id: grant._id, active: true } } }, {
    $set: { 'adminAccessGrants.$.active': false, 'adminAccessGrants.$.revokedBy': admin._id, 'adminAccessGrants.$.revokedAt': now, 'adminAccessGrants.$.revokeReason': reason },
    $push: { offlineAccessEvents: event }
  }, { returnDocument: 'after', runValidators: true }).populate('batch', 'name domain enabled status').lean()
  if (!updated) return fail(res, 'Access changed before revocation completed. Refresh and review the current status.', 409)
  return respond(res, { enrollment: offlineEnrollmentView(updated), grant: updated.adminAccessGrants.find(item => String(item._id) === String(grant._id)) })
}

export async function studentStatus(req, res) {
  if (!['active', 'suspended'].includes(req.body.accountStatus)) return fail(res, 'Invalid account status')
  const item = await Student.findByIdAndUpdate(req.params.id, { $set: { accountStatus: req.body.accountStatus }, $inc: { authVersion: 1 }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 } }, { returnDocument: 'after' })
  if (!item) return fail(res, 'Student not found', 404)
  await StudentSession.deleteMany({ student: item._id })
  return respond(res, { _id: item._id, ...studentDto(item) })
}
export async function announcements(_req, res) { return respond(res, await Announcement.find().sort({ createdAt: -1 }).lean()) }
export async function saveAnnouncement(req, res) {
  const item = req.params.id ? await Announcement.findById(req.params.id) : new Announcement()
  if (!item) return fail(res, 'Announcement not found', 404)
  for (const key of ['title', 'message', 'type', 'startDate', 'endDate', 'active']) if (key in req.body) {
    if (typeof req.body[key] !== (key === 'active' ? 'boolean' : 'string')) return fail(res, 'Invalid announcement field')
    item.set(key, ['startDate', 'endDate'].includes(key) && !req.body[key] ? null : req.body[key])
  }
  if (item.startDate && item.endDate && item.endDate < item.startDate) return fail(res, 'End date must follow start date.')
  try { await item.save(); return respond(res, item, req.params.id ? 200 : 201) } catch (error) { if (error.name === 'ValidationError') return fail(res, 'Enter a title, message, valid type and dates.'); throw error }
}
export async function deleteAnnouncement(req, res) { const item = await Announcement.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Announcement not found', 404) }
export async function adminProfile(req, res) { const item = await Admin.findById(req.admin.id).select('email role').lean(); return item ? respond(res, item) : fail(res, 'Admin not found', 404) }
export async function activity(_req, res) { return respond(res, await AdminActivity.find().sort({ createdAt: -1 }).limit(100).lean()) }
export function validateId(req, res, next) { if (req.params.id && !mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Record not found', 404); next() }
// Only action names and resource IDs are captured, never request bodies or credentials.
export function audit(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  let createdId
  const json = res.json.bind(res)
  res.json = value => { if (value?.data?._id) createdId = String(value.data._id); return json(value) }
  res.once('finish', () => {
    if (res.statusCode >= 400) return
    const switches = ['available', 'published', 'featured', 'trending', 'popular', 'active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled', 'classActive', ...Object.keys(settingDefaults).filter(key => typeof settingDefaults[key] === 'boolean')]
    const changes = switches.filter(key => typeof req.body?.[key] === 'boolean').map(key => `${key}=${req.body[key]}`)
    if (['active', 'suspended'].includes(req.body?.accountStatus)) changes.push(`accountStatus=${req.body.accountStatus}`)
    if (['draft', 'published'].includes(req.body?.status)) changes.push(`status=${req.body.status}`)
    if (typeof req.body?.meetingUrl === 'string') changes.push('meeting link updated')
    const resource = req.path.split('/').filter(Boolean).filter(part => !mongoose.isObjectIdOrHexString(part)).join(' / ')
    AdminActivity.create({ action: `${req.method} ${resource}${changes.length ? ': ' + changes.join(', ') : ''}`, target: createdId || req.path.split('/').find(part => mongoose.isObjectIdOrHexString(part)) || 'website' }).catch(() => console.error('Admin activity could not be recorded'))
  })
  next()
}
