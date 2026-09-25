import mongoose from 'mongoose'
import { TechNews } from '../models/tech-news.js'
import { respond, fail } from '../utils/api.js'

const fields = ['title', 'category', 'description', 'content', 'keyTakeaways', 'studentsShouldLearn', 'careerTip', 'readTime', 'publishDate', 'featured', 'status']
export const publishedNewsQuery = (now = new Date()) => ({ status: 'published', publishDate: { $lte: now } })
export async function listNews(req, res) {
  const query = TechNews.find(publishedNewsQuery()).sort({ publishDate: -1, _id: -1 }).select('-content -keyTakeaways -studentsShouldLearn -careerTip -source')
  if (req.query.latest === 'true') query.limit(1)
  return respond(res, await query.lean())
}
export async function readNews(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'News article not found', 404)
  const article = await TechNews.findOne({ _id: req.params.id, ...publishedNewsQuery() }).lean()
  return article ? respond(res, article) : fail(res, 'News article not found', 404)
}
export async function adminNews(_req, res) { return respond(res, await TechNews.find().sort({ publishDate: -1, _id: -1 }).lean()) }
export async function saveNews(req, res) {
  if (req.params.id && !mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'News article not found', 404)
  const article = req.params.id ? await TechNews.findById(req.params.id) : new TechNews()
  if (!article) return fail(res, 'News article not found', 404)
  const body = req.body || {}
  for (const field of fields) {
    if (!(field in body)) continue
    const value = body[field]
    if (['keyTakeaways', 'studentsShouldLearn'].includes(field)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return fail(res, `${field} must be a list of text points`)
    } else if (field === 'featured') {
      if (typeof value !== 'boolean') return fail(res, 'Featured must be true or false')
    } else if (field === 'readTime') {
      if (!Number.isInteger(value)) return fail(res, 'Read time must be a whole number of minutes')
    } else if (typeof value !== 'string') return fail(res, `${field} must be text`)
    article.set(field, value)
  }
  try { await article.save(); return respond(res, article, req.params.id ? 200 : 201) }
  catch (error) { if (error.name === 'ValidationError') return fail(res, Object.values(error.errors).map((item) => item.message).join(' ')); throw error }
}
export async function deleteNews(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'News article not found', 404)
  const article = await TechNews.findByIdAndDelete(req.params.id)
  return article ? respond(res, { deleted: true }) : fail(res, 'News article not found', 404)
}
