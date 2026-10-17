import mongoose from 'mongoose'

export function reviewAvatarUrl(value) {
  if (value === '') return true
  try {
    const url = new URL(value)
    return /^https?:\/\//i.test(value) && !url.username && !url.password && !/\s/.test(value)
  } catch { return false }
}
const text = maxlength => ({ type: String, required: true, trim: true, maxlength })
const schema = new mongoose.Schema({
  studentName: text(120), domain: text(120), reviewText: text(2000),
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  avatarUrl: { type: String, default: '', maxlength: 2048, validate: reviewAvatarUrl },
  verified: { type: Boolean, default: false },
  approved: { type: Boolean, default: false },
  enabled: { type: Boolean, default: false },
  // Private evidence reference/summary, never part of the public projection.
  verificationEvidence: { type: String, maxlength: 2000, select: false },
  verifiedBy: { type: String, select: false },
  verifiedAt: { type: Date, select: false },
}, { timestamps: true })
schema.index({ approved: 1, enabled: 1, verified: 1, createdAt: -1 })
export const StudentReview = mongoose.model('StudentReview', schema)
