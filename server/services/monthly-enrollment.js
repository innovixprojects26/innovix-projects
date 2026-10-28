import { BatchEnrollment, InternshipBatch } from '../models/learning.js'
import { getConfig, getDomain } from '../models/management.js'
import { sameInternshipDomain } from '../../shared/internship-domain.js'

const problem = (message, status = 409) => Object.assign(new Error(message), { status })
export function indiaMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now)
  return { year: Number(parts.find(p => p.type === 'year').value), month: Number(parts.find(p => p.type === 'month').value) }
}
export function hasActiveOfflinePaymentGrant(item) {
  const grant = item?.offlineAccessGrant
  if (grant?.accessSource !== 'ADMIN_OFFLINE_PAYMENT' || grant.active !== true || !grant.paymentRecordId) return false
  return Boolean((item.offlinePayments || []).some(payment =>
    String(payment._id) === String(grant.paymentRecordId) &&
    payment.accessSource === 'ADMIN_OFFLINE_PAYMENT' &&
    payment.status === 'Admin Verified' &&
    payment.currency === 'INR' &&
    Number.isSafeInteger(payment.amountPaise) && payment.amountPaise > 0 &&
    payment.student && String(payment.student) === String(item.student) &&
    payment.internship && String(payment.internship) === String(grant.internship) &&
    payment.approvedBy && payment.confirmedAt &&
    payment.idempotencyKey
  ))
}

export function hasActiveAdminAccessGrant(item, source) {
  const enrollmentDomain = item?.batch?.domain || item?.domain
  return Boolean((item?.adminAccessGrants || []).some(grant => {
    if (!['ADMIN_FREE_ACCESS', 'ADMIN_CUSTOM_PAYMENT'].includes(grant.accessSource) || (source && grant.accessSource !== source) || grant.active !== true) return false
    if (String(grant.student) !== String(item.student) || !grant.internship || !sameInternshipDomain(grant.domain, enrollmentDomain) || !grant.approvedBy || !grant.approvedAt || !grant.idempotencyKey) return false
    if (grant.accessSource === 'ADMIN_FREE_ACCESS') return !grant.customPaymentId
    return Boolean(grant.customPaymentId && (item.customAdminPayments || []).some(payment =>
      String(payment._id) === String(grant.customPaymentId) &&
      payment.accessSource === 'ADMIN_CUSTOM_PAYMENT' &&
      payment.status === 'Admin Verified' &&
      payment.currency === 'INR' &&
      Number.isSafeInteger(payment.amountPaise) && payment.amountPaise > 0 &&
      payment.student && String(payment.student) === String(item.student) &&
      payment.internship && String(payment.internship) === String(grant.internship) &&
      sameInternshipDomain(payment.domain, enrollmentDomain) &&
      ['UPI', 'Bank Transfer', 'Cash'].includes(payment.method) &&
      (payment.method === 'Cash' || Boolean(payment.transactionReference)) &&
      payment.paymentDate && payment.approvedBy && payment.confirmedBy && payment.confirmedAt
    ))
  }))
}

export function activeAdminAccessSource(item) {
  if (hasActiveOfflinePaymentGrant(item)) return 'ADMIN_OFFLINE_PAYMENT'
  return ['ADMIN_FREE_ACCESS', 'ADMIN_CUSTOM_PAYMENT'].find(source => hasActiveAdminAccessGrant(item, source)) || null
}

export const paidEnrollment = item => Boolean(item && (
  hasActiveOfflinePaymentGrant(item) ||
  ['Paid', 'PAID'].includes(item.paymentStatus) ||
  (item.testPayment?.status === 'Paid' && item.testPayment.paymentId && item.testPayment.verifiedAt)
))

export const paymentAllowsLearning = item => {
  if (!item) return false

  // An admin-confirmed offline payment is its own explicit domain grant. It
  // remains independent from any existing LIVE Razorpay order on the record.
  if (hasActiveOfflinePaymentGrant(item)) return true
  if (hasActiveAdminAccessGrant(item)) return true

  if (item.paymentMode === 'live' || item.livePayment) {
    return ['Paid', 'PAID'].includes(item.paymentStatus) &&
      item.paymentMode === 'live' &&
      item.livePayment?.status === 'Paid' &&
      Boolean(item.livePayment.orderId && item.livePayment.paymentId && item.livePayment.verifiedAt)
  }

  return paidEnrollment(item) &&
    (!(item.paymentMode === 'test' || item.testPayment?.verifiedAt) || process.env.NODE_ENV !== 'production')
}

export async function ensureMonthlyEnrollment(student, selectedDomain, now = new Date()) {
  const domain = await getDomain(selectedDomain || student.internshipDomain)
  if (!domain?.active || domain.name === 'AI Tools') throw problem('This internship is unavailable.', 403)

  if (!(await getConfig()).settings.batchesEnabled) throw problem('Internship enrollment is currently unavailable.')
  const existing = await BatchEnrollment.find({ student: student._id, status: { $in: ['Enrolled', 'Completed'] } }).sort({ createdAt: -1 }).populate('batch').lean()
  const matching = existing.filter(item => sameInternshipDomain(item.batch?.domain, domain.name))
  if (matching.some(item => item.domain && !sameInternshipDomain(item.domain, domain.name))) throw problem('Enrollment domain needs administrator review.')
  const reuse = matching.find(item => item.status === 'Enrolled') || matching.find(item => paidEnrollment(item) || hasActiveAdminAccessGrant(item))
  if (reuse) {
    if (!reuse.batch.enabled || ['Draft', 'Cancelled'].includes(reuse.batch.status)) throw problem('Your existing batch is currently unavailable.')
    return { enrollment: reuse, domain }
  }

  const { month, year } = indiaMonth(now)
  const code = `${domain.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${year}-${String(month).padStart(2, '0')}`
  let batch
  try {
    batch = await InternshipBatch.findOneAndUpdate({ code }, { $setOnInsert: { code, name: code, domain: domain.name, startDate: new Date(Date.UTC(year, month - 1, 1) - 19800000), endDate: new Date(Date.UTC(year, month, 1) - 19800001), mentor: 'Innovix Projects', maxStudents: 10000, status: 'Active', enabled: true } }, { upsert: true, returnDocument: 'after', runValidators: true }).lean()
  } catch (error) {
    if (error.code !== 11000) throw error
    batch = await InternshipBatch.findOne({ code }).lean()
  }
  if (!batch.enabled || ['Draft', 'Cancelled'].includes(batch.status)) throw problem('This monthly batch is currently unavailable.')
  let enrollment
  try {
    await BatchEnrollment.db.transaction(async session => {
      enrollment = await BatchEnrollment.findOne({ student: student._id, domain: domain.name, status: 'Enrolled' }).session(session).populate('batch').lean()
      if (enrollment) return
      const reserved = await InternshipBatch.updateOne({
        _id: batch._id, domain: domain.name, enabled: true, status: { $in: ['Upcoming', 'Active'] },
        $expr: { $lt: ['$enrollmentCount', '$maxStudents'] },
      }, { $inc: { enrollmentCount: 1 } }, { session })
      if (!reserved.modifiedCount) throw problem('This monthly batch is full or unavailable.')
      const [created] = await BatchEnrollment.create([{ student: student._id, batch: batch._id, domain: domain.name, month, year, enrolledAt: now, paymentStatus: 'NOT_PAID', learningAccessStatus: 'LOCKED', status: 'Enrolled' }], { session })
      enrollment = await BatchEnrollment.findById(created._id).session(session).populate('batch').lean()
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    enrollment = await BatchEnrollment.findOne({ student: student._id, domain: domain.name, status: 'Enrolled' }).populate('batch').lean()
  }
  if (!sameInternshipDomain(enrollment?.batch?.domain, domain.name)) throw problem('Your enrollment changed. Refresh before continuing.')
  return { enrollment, domain }
}
