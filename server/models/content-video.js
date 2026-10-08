import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  domain: { type: String, default: 'Content Creation', index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  module: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  publishDate: { type: Date, required: true },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  required: { type: Boolean, default: true },
  position: { type: Number, default: Date.now },
  duration: { type: Number, min: 0, max: 86400 },
  videoFile: String,
  videoUrl: { type: String, default: '' },
  thumbnailFile: String,
  videoBytes: Number,
}, { timestamps: true })
schema.index({ status: 1, position: 1, _id: 1 })
// Reuse the existing collection for all internship domains.
export const ContentVideo = mongoose.model('ContentCreationVideo', schema)
