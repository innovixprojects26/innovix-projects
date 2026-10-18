import { createHash, randomUUID } from 'node:crypto'
import { RazorpayWebhookEvent } from '../models/razorpay-webhook-event.js'
import { reconcileLivePayment } from './razorpay-reconcile.js'

export async function processRazorpayEvent(eventId, event, rawBody) {
  const payloadHash = createHash('sha256').update(rawBody).digest('hex')
  const leaseToken = randomUUID(), leaseUntil = new Date(Date.now() + 60000)
  await RazorpayWebhookEvent.init()
  let receipt
  try {
    receipt = await RazorpayWebhookEvent.create({ eventId, eventType: event.event, payloadHash, leaseToken, leaseUntil, status: 'Processing' })
  } catch (error) {
    if (error.code !== 11000) throw error
    const existing = await RazorpayWebhookEvent.findOne({ eventId }).lean()
    if (existing.payloadHash && existing.payloadHash !== payloadHash) throw Object.assign(new Error('Event ID payload conflict.'), { status: 409 })
    if (existing.status === 'Processed') return { duplicate: true }
    receipt = await RazorpayWebhookEvent.findOneAndUpdate({ eventId, status: { $ne: 'Processed' },
      $or: [{ status: 'Failed' }, { leaseUntil: { $lte: new Date() } }, { leaseUntil: { $exists: false } }]
    }, { $set: { payloadHash, leaseToken, leaseUntil, status: 'Processing' } }, { returnDocument: 'after' })
    if (!receipt) throw Object.assign(new Error('Event reconciliation is in progress.'), { status: 503 })
  }
  try {
    const refund = event.event.startsWith('refund.')
    const entity = event.payload[refund ? 'refund' : 'payment'].entity
    const paymentId = refund ? entity.payment_id : entity.id
    await reconcileLivePayment(paymentId, undefined, ['refund.processed', 'payment.refunded'].includes(event.event))
    const saved = await RazorpayWebhookEvent.updateOne({ eventId, leaseToken, status: 'Processing' }, {
      $set: { status: 'Processed', paymentId, processedAt: new Date() }, $unset: { leaseToken: 1, leaseUntil: 1, errorMessage: 1 }
    })
    if (!saved.modifiedCount) throw new Error('Event lease changed.')
    return { duplicate: false }
  } catch (error) {
    await RazorpayWebhookEvent.updateOne({ eventId, leaseToken, status: 'Processing' }, {
      $set: { status: 'Failed', errorMessage: 'Reconciliation pending; retry or administrator review required.' }, $unset: { leaseToken: 1, leaseUntil: 1 }
    })
    throw error
  }
}
