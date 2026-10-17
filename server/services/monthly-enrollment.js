import { BatchEnrollment, InternshipBatch } from '../models/learning.js'
import { getConfig, getDomain } from '../models/management.js'
import { sameInternshipDomain } from '../../shared/internship-domain.js'

const problem = (message, status = 409) => Object.assign(new Error(message), { status })
export function indiaMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now)
  return { year: Number(parts.find(p => p.type === 'year').value), month: Number(parts.find(p => p.type === 'month').value) }
}
export const paidEnrollment = item => Boolean(item && (['Paid', 'PAID'].includes(item.paymentStatus) || (item.testPayment?.status === 'Paid' && item.testPayment.paymentId && item.testPayment.verifiedAt)))

export const paymentAllowsLearning = item => {
  if (!item) return false

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
  if (!sameInternshipDomain(domain.name, student.internshipDomain)) throw problem('Select the internship domain registered to your student account.', 403)
  if (!(await getConfig()).settings.batchesEnabled) throw problem('Internship enrollment is currently unavailable.')
  const existing = await BatchEnrollment.find({ student: student._id, status: { $in: ['Enrolled', 'Completed'] } }).sort({ createdAt: -1 }).populate('batch').lean()
  const matching = existing.filter(item => sameInternshipDomain(item.batch?.domain, domain.name))
  const reuse = matching.find(paidEnrollment) || matching.find(item => item.status === 'Enrolled')
  if (reuse) {
    if (!reuse.batch.enabled || ['Draft', 'Cancelled'].includes(reuse.batch.status)) throw problem('Your existing batch is currently unavailable.')
    return { enrollment: reuse, domain }
  }
  // Preserve the existing single-active-enrollment invariant and historical records.
  if (existing.some(item => item.status === 'Enrolled')) throw problem('Your account already has an active enrollment in another domain.')
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
      enrollment = await BatchEnrollment.findOne({ student: student._id, status: 'Enrolled' }).session(session).populate('batch').lean()
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
    enrollment = await BatchEnrollment.findOne({ student: student._id, status: 'Enrolled' }).populate('batch').lean()
  }
  if (!sameInternshipDomain(enrollment?.batch?.domain, domain.name)) throw problem('Your enrollment changed. Refresh before continuing.')
  return { enrollment, domain }
}
