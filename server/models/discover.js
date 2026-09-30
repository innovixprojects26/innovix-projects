import { WebsiteConfig } from './management.js'
import mongoose from 'mongoose'
import { discoverDomains, discoverTypes, defaultDiscoverCategories } from '../../shared/discover.js'

const { Schema, model } = mongoose
export const DiscoverCategory = model('DiscoverCategory', new Schema({ name: { type: String, required: true, unique: true, maxlength: 80 }, domains: [{ type: String, enum: discoverDomains }], keywords: [String], active: { type: Boolean, default: true } }, { timestamps: true }))
export const DiscoverSource = model('DiscoverSource', new Schema({
  name: { type: String, required: true, maxlength: 120 }, url: { type: String, required: true, unique: true }, type: { type: String, enum: ['RSS', 'ATOM', 'JSON_FEED'], required: true }, categories: [String], domains: [{ type: String, enum: discoverDomains }], active: { type: Boolean, default: false },
  lastFetchedAt: Date, fetchStatus: { type: String, default: 'Never fetched' }, fetchError: { type: String, default: '' }, nextFetchAt: Date, lockedUntil: Date, lease: { type: String, select: false },
}, { timestamps: true }))
const itemSchema = new Schema({
  title: { type: String, required: true, maxlength: 180 }, summary: { type: String, required: true, maxlength: 600 }, explanation: { type: String, default: '', maxlength: 1600 }, whyItMatters: { type: String, default: '', maxlength: 600 }, whatYouCanLearn: { type: String, default: '', maxlength: 600 }, takeaway: { type: String, default: '', maxlength: 600 },
  category: { type: String, required: true }, domains: [{ type: String, enum: discoverDomains }], type: { type: String, enum: discoverTypes, default: 'QUICK_LEARN' }, status: { type: String, enum: ['draft', 'pending', 'published', 'rejected'], default: 'draft' }, featured: { type: Boolean, default: false }, trending: { type: Boolean, default: false }, readTime: { type: Number, min: 1, max: 15, default: 2 },
  deletedAt: Date,
  sourceName: { type: String, default: 'Innovix Projects', maxlength: 120 }, sourceUrl: { type: String, default: '' }, source: { type: Schema.Types.ObjectId, ref: 'DiscoverSource' }, imported: { type: Boolean, default: false }, originalTitle: String, externalKey: { type: String, unique: true, sparse: true }, publishedAt: { type: Date, required: true, default: Date.now }, retrievedAt: Date,
}, { timestamps: true })
itemSchema.index({ status: 1, domains: 1, publishedAt: -1 })
export const DiscoverItem = model('DiscoverItem', itemSchema)
const readSchema = new Schema({ student: { type: Schema.Types.ObjectId, ref: 'Student', required: true }, item: { type: Schema.Types.ObjectId, ref: 'DiscoverItem', required: true }, readAt: { type: Date, default: Date.now } })
readSchema.index({ student: 1, item: 1 }, { unique: true })
export const DiscoverRead = model('DiscoverRead', readSchema)
export async function ensureDiscoverCategories() {
  await DiscoverCategory.init()
  // Seed only a completely empty category catalog; never recreate a deleted mapping.
  if ((await WebsiteConfig.findById('website').select('discoverCategoriesInitialized').lean())?.discoverCategoriesInitialized) return
  if (await DiscoverCategory.exists({})) { await WebsiteConfig.updateOne({ _id: 'website' }, { $set: { discoverCategoriesInitialized: true } }, { upsert: true }); return }
  await DiscoverCategory.bulkWrite(defaultDiscoverCategories.map(item => ({ updateOne: { filter: { name: item.name }, update: { $setOnInsert: { ...item, active: true } }, upsert: true } })))
  await WebsiteConfig.updateOne({ _id: 'website' }, { $set: { discoverCategoriesInitialized: true } }, { upsert: true })
}
