import mongoose from 'mongoose'

const { Schema, model } = mongoose

const webhookEventSchema = new Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    immutable: true
  },
  eventType: {
    type: String,
    required: true
  },
  paymentId: String,
  orderId: String,
  status: {
    type: String,
    enum: ['Processing', 'Processed', 'Failed'],
    default: 'Processing'
  },
  processedAt: Date,
  errorMessage: String
}, { timestamps: true })

webhookEventSchema.index({ status: 1, createdAt: 1 })

export const RazorpayWebhookEvent = model(
  'RazorpayWebhookEvent',
  webhookEventSchema
)
