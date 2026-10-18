import { BatchEnrollment } from '../models/learning.js'
import { Student } from '../models/student.js'
import { liveRazorpay } from './razorpay-live.js'

const retry = () => Object.assign(new Error('Payment reconciliation requires retry or administrator review.'), { status: 503 })

// Fetch current provider state, never trust event ordering or client-supplied amounts.
export async function reconcileLivePayment(paymentId, expectedStudent, requireRefund = false) {
  if (!/^pay_[a-zA-Z0-9]+$/.test(paymentId || '')) throw retry()
  const payment = await liveRazorpay(`payments/${paymentId}`)
  if (payment.id !== paymentId || !/^order_[a-zA-Z0-9]+$/.test(payment.order_id || '')) throw retry()
  const matches = await BatchEnrollment.find({ 'livePayment.orderId': payment.order_id }).limit(2).lean()
  if (matches.length !== 1) throw retry()
  const enrollment = matches[0], stored = enrollment.livePayment
  if (expectedStudent && String(enrollment.student) !== String(expectedStudent)) throw retry()
  if (!await Student.exists({ _id: enrollment.student })) throw retry()
  const order = await liveRazorpay(`orders/${payment.order_id}`)
  if (order.id !== stored.orderId || order.amount !== stored.amount || order.currency !== 'INR' ||
      order.notes?.purpose !== 'internship_live' || order.notes?.enrollment !== String(enrollment._id) ||
      order.receipt !== `il_${enrollment._id}` || payment.amount !== stored.amount || payment.currency !== 'INR' ||
      !Number.isSafeInteger(payment.amount_refunded) || payment.amount_refunded < 0 || payment.amount_refunded > stored.amount) throw retry()
  if (requireRefund && payment.amount_refunded === 0) throw retry()
  // Failed attempts on the same order must never replace its successful payment.
  if (stored.paymentId && stored.paymentId !== paymentId) {
    if (payment.status === 'failed') return { status: stored.status, paymentId }
    throw retry()
  }
  const filter = { _id: enrollment._id, student: enrollment.student, 'livePayment.orderId': stored.orderId,
    $or: [{ 'livePayment.paymentId': { $exists: false } }, { 'livePayment.paymentId': paymentId }] }
  if (payment.amount_refunded > 0) {
    if (!payment.captured || !['captured', 'refunded'].includes(payment.status)) throw retry()
    // Refund totals are monotonic. A delayed capture/callback can never reopen access.
    await BatchEnrollment.updateOne({ ...filter, $and: [{ $or: [
      { 'livePayment.amountRefunded': { $exists: false } }, { 'livePayment.amountRefunded': { $lte: payment.amount_refunded } }
    ] }] }, { $set: { 'livePayment.paymentId': paymentId,
      'livePayment.status': payment.amount_refunded === stored.amount ? 'Refunded' : 'PartiallyRefunded',
      'livePayment.amountRefunded': payment.amount_refunded, 'livePayment.reconciledAt': new Date(),
      paymentMode: 'live', learningAccessStatus: 'LOCKED' } })
  } else if (payment.status === 'captured' && payment.captured === true) {
    await BatchEnrollment.updateOne({ ...filter,
      'livePayment.status': { $nin: ['Paid', 'Refunded', 'PartiallyRefunded'] },
      $and: [{ $or: [{ 'livePayment.amountRefunded': { $exists: false } }, { 'livePayment.amountRefunded': 0 }] }],
      paymentStatus: { $nin: ['Paid', 'PAID'] }
    }, { $set: { 'livePayment.status': 'Paid', 'livePayment.paymentId': paymentId,
      'livePayment.verifiedAt': new Date(), 'livePayment.reconciledAt': new Date(),
      paymentStatus: 'PAID', paymentMode: 'live', learningAccessStatus: 'UNLOCKED' } })
  } else if (payment.status === 'failed') {
    await BatchEnrollment.updateOne({ ...filter, 'livePayment.status': { $in: ['Creating', 'Pending', 'Failed'] }, paymentStatus: { $nin: ['Paid', 'PAID'] } },
      { $set: { 'livePayment.status': 'Failed', 'livePayment.reconciledAt': new Date(), learningAccessStatus: 'LOCKED' } })
  } else {
    throw retry() // Authorized/pending payments never unlock learning.
  }
  const current = await BatchEnrollment.findById(enrollment._id).lean()
  return { status: current.livePayment.status, paymentId }
}
