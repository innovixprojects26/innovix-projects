import { BatchEnrollment } from '../models/learning.js'
import { getConfig } from '../models/management.js'
import { ensureMonthlyEnrollment, paidEnrollment } from '../services/monthly-enrollment.js'
import { problem } from '../services/learning-access.js'
import { paise } from '../services/razorpay-test.js'
import { liveCredentials, liveRazorpay, verifiedLivePayment } from '../services/razorpay-live.js'
import { respond } from '../utils/api.js'

async function liveContext(student, domain) {
  const config = await getConfig()

  if (!config.settings.internshipPaymentsEnabled) {
    throw problem('LIVE internship payments are not enabled.', 503)
  }

  liveCredentials()

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

  if (
    enrollment.livePayment.status === 'Paid' &&
    enrollment.livePayment.paymentId !== paymentId
  ) {
    throw problem('Order already verified with another payment.', 409)
  }

  const saved = await BatchEnrollment.updateOne(
    {
      _id: enrollment._id,
      'livePayment.orderId': orderId,
      'livePayment.status': { $ne: 'Paid' },
      paymentStatus: { $nin: ['Paid', 'PAID'] }
    },
    {
      $set: {
        'livePayment.status': 'Paid',
        'livePayment.paymentId': paymentId,
        'livePayment.verifiedAt': new Date(),
        paymentStatus: 'PAID',
        paymentMode: 'live',
        learningAccessStatus: 'UNLOCKED'
      }
    }
  )

  if (!saved.modifiedCount) {
    const current = await BatchEnrollment.findById(enrollment._id).lean()

    if (
      current?.livePayment?.status !== 'Paid' ||
      current.livePayment.paymentId !== paymentId
    ) {
      throw problem('LIVE payment verification conflict.', 409)
    }
  }

  return respond(res, {
    status: 'Paid',
    mode: 'live'
  })
}
