import { ensureMonthlyEnrollment, paidEnrollment } from '../services/monthly-enrollment.js'
import { BatchEnrollment } from '../models/learning.js'
import { getConfig, InternshipDomain } from '../models/management.js'
import { sameInternshipDomain } from '../../shared/internship-domain.js'
import { problem } from '../services/learning-access.js'
import { paise, razorpay, testCredentials, verifiedPayment } from '../services/razorpay-test.js'
import { respond } from '../utils/api.js'

export function localTestOnly(req, _res, next) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) throw problem('Test checkout is available only on localhost.', 403)
  testCredentials()
  next()
}
async function context(student) {
  if (!(await getConfig()).settings.batchesEnabled) throw problem('Batch enrollment is currently unavailable.', 409)
  const enrollment = await BatchEnrollment.findOne({ student: student._id, status: { $in: ['Enrolled', 'Completed'] } }).sort({ createdAt: -1 }).populate('batch', 'domain enabled status code').lean()
  if (!enrollment?.batch?.enabled || ['Draft', 'Cancelled'].includes(enrollment.batch.status) || !sameInternshipDomain(enrollment.batch.domain, student.internshipDomain)) throw problem('Select your internship domain to create your monthly enrollment.', 409)
  const domain = (await InternshipDomain.find({ active: true }).select('name price').lean()).find(item => sameInternshipDomain(item.name, enrollment.batch.domain))
  if (!domain) throw problem('Internship pricing is unavailable.', 409)
  if (domain.name === 'AI Tools') throw problem('AI Tools learning and test checkout are currently unavailable.', 403)
  return { enrollment, domain }
}
function view(enrollment, domain) {
  const payment = enrollment.testPayment
  return { enrollmentId: String(enrollment._id), batchCode: enrollment.batch?.code, month: enrollment.month, year: enrollment.year, paymentStatus: paidEnrollment(enrollment) ? 'PAID' : 'NOT_PAID', domain: domain.name, fee: payment?.amount ? payment.amount / 100 : domain.price, amount: payment?.amount || paise(domain.price), currency: 'INR', mode: 'test', status: paidEnrollment(enrollment) ? 'Paid' : payment?.status || 'Not Paid', orderId: payment?.orderId, alreadyPaid: paidEnrollment(enrollment) }
}
export async function quote(req, res) {
  const { enrollment, domain } = await context(req.student)
  return respond(res, view(enrollment, domain))
}
export async function createOrder(req, res) {
  const { enrollment, domain } = await ensureMonthlyEnrollment(req.student, req.body?.domain)
  if (paidEnrollment(enrollment)) return respond(res, view(enrollment, domain))
  if (enrollment.testPayment?.status === 'Paid') return respond(res, view(enrollment, domain))
  if (enrollment.testPayment?.orderId) return respond(res, { ...view(enrollment, domain), key: testCredentials().key })
  if (enrollment.status !== 'Enrolled') throw problem('This completed enrollment cannot start a new payment.', 409)
  const amount = paise(domain.price)
  // Atomic reservation prevents concurrent requests and retries creating duplicate orders.
  const reserved = await BatchEnrollment.findOneAndUpdate({ _id: enrollment._id, student: req.student._id, status: 'Enrolled', paymentStatus: { $nin: ['Paid', 'PAID'] }, 'testPayment.status': { $exists: false } }, { $set: { testPayment: { status: 'Creating', amount, currency: 'INR' } } }, { returnDocument: 'after' })
  if (!reserved) throw problem('Order creation is in progress or needs reconciliation. Retry shortly; if it persists, ask Admin to check the test order.', 409)
  // Keep the reservation on timeout: the provider may have created the order.
  // Never automatically retry an ambiguous POST and risk a duplicate charge.
  const order = await razorpay('orders', { amount, currency: 'INR', receipt: `it_${enrollment._id}`, notes: { purpose: 'internship_test', enrollment: String(enrollment._id) } })
  if (!/^order_[a-zA-Z0-9]+$/.test(order.id) || order.amount !== amount || order.currency !== 'INR') throw problem('Unexpected test order response. Ask Admin to reconcile this order.', 502)
  const updated = await BatchEnrollment.findOneAndUpdate({ _id: enrollment._id, 'testPayment.status': 'Creating' }, { $set: { 'testPayment.orderId': order.id, 'testPayment.status': 'Pending' } }, { returnDocument: 'after' }).lean()
  if (!updated) throw problem('Order needs reconciliation. Contact Admin before retrying.', 409)
  return respond(res, { ...view(updated, domain), key: testCredentials().key })
}
export async function verify(req, res) {
  const orderId = req.body?.razorpay_order_id
  if (typeof orderId !== 'string' || !/^order_[a-zA-Z0-9]+$/.test(orderId)) throw problem('Invalid payment order.')
  const enrollment = await BatchEnrollment.findOne({ student: req.student._id, 'testPayment.orderId': orderId }).lean()
  if (!enrollment) throw problem('Payment order not found.', 404)
  const paymentId = await verifiedPayment(enrollment.testPayment, req.body)
  if (enrollment.testPayment.status === 'Paid' && enrollment.testPayment.paymentId !== paymentId) throw problem('This order was already verified with another payment.', 409)
  const saved = await BatchEnrollment.updateOne({ _id: enrollment._id, 'testPayment.orderId': orderId, 'testPayment.status': { $ne: 'Paid' } }, { $set: { 'testPayment.status': 'Paid', 'testPayment.paymentId': paymentId, 'testPayment.verifiedAt': new Date(), ...(enrollment.enrolledAt ? { paymentStatus: 'PAID', paymentMode: 'test', learningAccessStatus: 'UNLOCKED' } : { learningAccessStatus: 'UNLOCKED' }) } })
  if (!saved.modifiedCount) {
    const current = await BatchEnrollment.findById(enrollment._id).lean()
    if (current?.testPayment?.status !== 'Paid' || current.testPayment.paymentId !== paymentId) throw problem('This order was already verified with another payment.', 409)
  }
  // TEST verification unlocks eligible learning only; real payment records stay unchanged.
  return respond(res, { status: 'Paid', mode: 'test' })
}

export async function enroll(req, res) {
  const { enrollment, domain } = await ensureMonthlyEnrollment(req.student, req.body?.domain)
  return respond(res, view(enrollment, domain))
}
