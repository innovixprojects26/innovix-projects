import mongoose from 'mongoose'

export const eventCategories = ['Hackathon', 'Webinar', 'Workshop', 'Tech Competition']
export const eventStatuses = ['draft', 'published']
export function eventUrl(value) {
  if (value === '') return true
  try {
    const url = new URL(value)
    return /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/\s/.test(value)
  } catch { return false }
}
// Require a real calendar date, optionally followed by an ISO time with timezone.
export function eventDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false
  const day = value.slice(0, 10)
  const parsedDay = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(parsedDay.getTime()) && parsedDay.toISOString().slice(0, 10) === day && Number.isFinite(Date.parse(value))
}
const text = (maxlength) => ({ type: String, required: true, trim: true, maxlength })
const url = { type: String, trim: true, maxlength: 2048, default: '', validate: { validator: eventUrl, message: 'URL must use HTTP or HTTPS without credentials.' } }
const schema = new mongoose.Schema({
  title: text(160),
  category: { ...text(40), enum: eventCategories },
  description: text(2000),
  eventDate: { type: Date, required: true },
  posterUrl: url,
  registrationUrl: url,
  // Display metadata only. This model has no payment integration.
  isFree: { type: Boolean, default: false },
  enabled: { type: Boolean, default: false },
  status: { type: String, enum: eventStatuses, default: 'draft' },
}, { timestamps: true })
schema.index({ enabled: 1, status: 1, eventDate: 1 })
export const Event = mongoose.model('Event', schema)
