import mongoose from 'mongoose'
import { newsCategories } from '../../shared/tech-news.js'

const requiredText = (maxlength) => ({ type: String, required: true, trim: true, maxlength })
const points = { type: [String], required: true, validate: { validator: (items) => items.length > 0 && items.length <= 50 && items.every((item) => item.trim().length > 0 && item.length <= 1000), message: 'Enter between 1 and 50 non-empty points (up to 1000 characters each).' } }
const schema = new mongoose.Schema({
  title: requiredText(200), category: { ...requiredText(100), enum: newsCategories },
  description: requiredText(500), content: requiredText(30000), keyTakeaways: points,
  studentsShouldLearn: points, careerTip: requiredText(2000),
  readTime: { type: Number, required: true, min: 1, max: 120, validate: Number.isInteger },
  publishDate: { type: Date, required: true }, featured: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  // Reserved for a future trusted ingestion adapter; never accepted from public requests.
  source: { type: String, default: 'admin' },
}, { timestamps: true })
schema.index({ status: 1, publishDate: -1, _id: -1 })
export const TechNews = mongoose.model('TechNews', schema)
