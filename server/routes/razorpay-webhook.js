import express from 'express'
import { verifyRazorpayWebhook } from '../services/razorpay-webhook.js'
import { RazorpayWebhookEvent } from '../models/razorpay-webhook-event.js'

const router = express.Router()
const supported = new Set(['payment.captured', 'payment.failed', 'payment.refunded', 'refund.created', 'refund.processed', 'refund.failed'])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const reject = (res, status, message) => res.status(status).json({ success: false, message })

router.post('/',
  (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() },
  express.raw({ type: 'application/json', limit: '256kb', inflate: false }),
  async (req, res) => {
    if (!req.is('application/json')) return reject(res, 415, 'Use application/json.')
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return reject(res, 503, 'Webhook receiver temporarily unavailable.')
    if (!verifyRazorpayWebhook(req.body, req.headers['x-razorpay-signature'])) {
      return reject(res, 401, 'Invalid webhook signature.')
    }
    let event
    try { event = JSON.parse(req.body.toString('utf8')) }
    catch { return reject(res, 400, 'Invalid webhook JSON.') }
    if (!object(event) || event.entity !== 'event' || typeof event.event !== 'string' || !object(event.payload)) {
      return reject(res, 400, 'Invalid webhook structure.')
    }
    if (!supported.has(event.event)) return reject(res, 400, 'Unsupported webhook event.')
    const refund = event.event.startsWith('refund.')
    const entry = event.payload[refund ? 'refund' : 'payment']
    const entity = entry?.entity
    if (!object(entry) || !object(entity) || entity.entity !== (refund ? 'refund' : 'payment') ||
        typeof entity.id !== 'string' || !(refund ? /^rfnd_[a-zA-Z0-9]+$/ : /^pay_[a-zA-Z0-9]+$/).test(entity.id) ||
        (refund && (typeof entity.payment_id !== 'string' || !/^pay_[a-zA-Z0-9]+$/.test(entity.payment_id)))) {
      return reject(res, 400, 'Invalid webhook payload.')
    }
    const eventId = req.headers['x-razorpay-event-id']
    if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(eventId)) {
      return reject(res, 400, 'Invalid webhook event ID.')
    }
    res.set('Retry-After', '300')
    try {
      await RazorpayWebhookEvent.create({ eventId, eventType: event.event, status: 'Processing' })
    } catch (error) {
      // The unique eventId index deduplicates concurrent deliveries without overwrites.
      if (error.code !== 11000) return reject(res, 503, 'Webhook receiver temporarily unavailable.')
    }
    // Receipt only: neither new nor duplicate events are acknowledged as processed.
    return reject(res, 503, 'Webhook processing is not enabled. Retry later.')
  }
)
router.use((error, _req, res, _next) => {
  const status = error.type === 'entity.too.large' ? 413 : error.status === 415 ? 415 : 400
  return reject(res, status, status === 413 ? 'Webhook body exceeds the size limit.' : 'Invalid webhook request body.')
})

export default router
