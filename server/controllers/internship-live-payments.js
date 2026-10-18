import { reconcileLivePayment } from '../services/razorpay-reconcile.js'
import { findCapturedOrderPayment } from '../services/razorpay-order-recovery.js'
import { BatchEnrollment } from '../models/learning.js'
import { getConfig } from '../models/management.js'
import { ensureMonthlyEnrollment, paidEnrollment } from '../services/monthly-enrollment.js'
import { problem } from '../services/learning-access.js'
import { paise } from '../services/razorpay-test.js'
import { liveCredentials, liveRazorpay, verifiedLivePayment, livePaymentAvailability, requireLiveActivation } from '../services/razorpay-live.js'
import { respond } from '../utils/api.js'
import { normalizeInternshipDomain } from '../../shared/internship-domain.js'

async function liveContext(student, domain) {
  const config = await getConfig()

  if (!config.settings.internshipPaymentsEnabled) {
    throw problem('LIVE internship payments are not enabled.', 503)
  }

  requireLiveActivation()

  const result = await ensureMonthlyEnrollment(student, domain)

  if (paidEnrollment(result.enrollment)) {
    throw problem('This internship enrollment is already paid.', 409)
  }

  if (result.enrollment.status !== 'Enrolled') {
    throw problem('This enrollment cannot accept a new payment.', 409)
  }

  return result
}

export async function createLiveOrder(req, res) {
  const { enrollment, domain } = await liveContext(
    req.student,
    req.body?.domain
  )

  const amount = paise(domain.price)

  if (enrollment.livePayment?.orderId) {
    return respond(res, {
      orderId: enrollment.livePayment.orderId,
      amount: enrollment.livePayment.amount,
      currency: 'INR',
      key: liveCredentials().key,
      domain: domain.name
    })
  }

  const reserved = await BatchEnrollment.findOneAndUpdate(
    {
      _id: enrollment._id,
      student: req.student._id,
      status: 'Enrolled',
      paymentStatus: { $nin: ['Paid', 'PAID'] },
      'livePayment.status': { $exists: false }
    },
    {
      $set: {
        livePayment: {
          status: 'Creating',
          amount,
          currency: 'INR'
        }
      }
    },
    { returnDocument: 'after' }
  )

  if (!reserved) {
    throw problem(
      'Payment order already exists or needs reconciliation. Contact Admin before retrying.',
      409
    )
  }

  // Preserve the reservation on ambiguous network failures.
  // Never automatically retry an uncertain LIVE order creation.
  const order = await liveRazorpay('orders', {
    amount,
    currency: 'INR',
    receipt: `il_${enrollment._id}`,
    notes: {
      purpose: 'internship_live',
      enrollment: String(enrollment._id)
    }
  })

  if (
    !/^order_[a-zA-Z0-9]+$/.test(order?.id || '') ||
    order.amount !== amount ||
    order.currency !== 'INR'
  ) {
    throw problem('Unexpected LIVE order response. Admin reconciliation required.', 502)
  }

  const updated = await BatchEnrollment.findOneAndUpdate(
    {
      _id: enrollment._id,
      'livePayment.status': 'Creating'
    },
    {
      $set: {
        'livePayment.orderId': order.id,
        'livePayment.status': 'Pending'
      }
    },
    { returnDocument: 'after' }
  ).lean()

  if (!updated) {
    throw problem('LIVE order needs reconciliation. Contact Admin.', 409)
  }

  return respond(res, {
    orderId: order.id,
    amount,
    currency: 'INR',
    key: liveCredentials().key,
    domain: domain.name
  })
}


export async function verifyLiveOrder(req, res) {
  requireLiveActivation()
  const orderId = req.body?.razorpay_order_id

  if (
    typeof orderId !== 'string' ||
    !/^order_[a-zA-Z0-9]+$/.test(orderId)
  ) {
    throw problem('Invalid LIVE payment order.', 400)
  }

  const enrollment = await BatchEnrollment.findOne({
    student: req.student._id,
    'livePayment.orderId': orderId
  }).lean()

  if (!enrollment) {
    throw problem('LIVE payment order not found.', 404)
  }

  const paymentId = await verifiedLivePayment(
    enrollment.livePayment,
    req.body
  )

  const result = await reconcileLivePayment(paymentId, req.student._id)
  if (result.status !== 'Paid') throw problem('Payment is refunded or is not verified for learning access.', 409)

  return respond(res, {
    status: 'Paid',
    mode: 'live'
  })
}

function requiredRecoveryDomain(value) {
  const domain = normalizeInternshipDomain(value)
  if (!domain) {
    throw problem('A valid internship domain is required.', 400)
  }
  return domain
}
export async function recoverLiveOrder(req, res) {
  requireLiveActivation()

  const domain = requiredRecoveryDomain(req.body?.domain)

  const enrollment = await BatchEnrollment.findOne({
    student: req.student._id,
    domain,
    status: 'Enrolled',
    'livePayment.orderId': { $exists: true }
  }).sort({ createdAt: -1 }).lean()

  if (!enrollment) {
    throw problem('No existing LIVE payment order was found.', 404)
  }

  const payment = enrollment.livePayment

  if (payment.status === 'Paid') {
    if (!payment.paymentId) {
      throw problem('Paid enrollment has no verified payment ID. Administrator review required.', 409)
    }

    const reconciled = await reconcileLivePayment(
      payment.paymentId,
      req.student._id
    )

    return respond(res, {
      status: reconciled.status,
      message: reconciled.status === 'Paid'
        ? 'Payment remains verified.'
        : 'Payment status changed. Learning access requires review.'
    })
  }

  const result = await findCapturedOrderPayment(
    payment.orderId,
    payment.amount,
    String(enrollment._id)
  )

  if (result.status !== 'Found') {
    return respond(res, {
      status: 'Pending',
      message: 'No captured payment found. Do not pay again until payment status is confirmed.'
    })
  }

  const reconciled = await reconcileLivePayment(
    result.paymentId,
    req.student._id
  )

  return respond(res, {
    status: reconciled.status,
    message: reconciled.status === 'Paid'
      ? 'Payment verified. Learning access is now available.'
      : 'Payment requires review. Learning access remains restricted.'
  })
}
export async function liveRecoveryStatus(req, res) {
  const domain = requiredRecoveryDomain(req.query?.domain)

  const enrollment = await BatchEnrollment.findOne({
    student: req.student._id,
    domain,
    'livePayment.orderId': { $exists: true }
  }).sort({ createdAt: -1 }).lean()

  if (!enrollment) {
    return respond(res, {
      status: 'NotStarted',
      hasOrder: false,
      canRetryPayment: false
    })
  }

  const payment = enrollment.livePayment

  return respond(res, {
    status: payment?.status || 'Pending',
    hasOrder: Boolean(payment?.orderId),
    canRetryPayment: false,
    requiresReview: !['Paid'].includes(payment?.status),
    message: payment?.status === 'Paid'
      ? 'Payment recorded as verified.'
      : 'Payment requires provider verification. Do not pay again until reconciliation completes.'
  })
}
export async function liveStatus(_req, res) {
  const config = await getConfig()
  return respond(res, livePaymentAvailability(config.settings.internshipPaymentsEnabled))
}
