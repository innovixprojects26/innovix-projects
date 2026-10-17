import { getConfig } from '../models/management.js'
import mongoose from 'mongoose'
import { DiscoverItem, DiscoverCategory, DiscoverSource } from '../models/discover.js'
import { discoverDomains, normalizeArticleUrl } from '../../shared/discover.js'
import { TechNews } from '../models/tech-news.js'
import { respond, fail } from '../utils/api.js'

const fields = ['title', 'category', 'description', 'content', 'keyTakeaways', 'studentsShouldLearn', 'careerTip', 'readTime', 'publishDate', 'featured', 'status']
export const publishedNewsQuery = (now = new Date()) => ({ status: 'published', publishDate: { $lte: now } })
// Public news spans valid discovery domains; student-specific ranking stays private.
async function importedNews(settings, id) {
  if (!settings.discoverEnabled) return []
  const [categories, sources] = await Promise.all([
    DiscoverCategory.find({ active: true }).select('name').lean(),
    DiscoverSource.find({ active: true }).select('_id').lean(),
  ])
  const items = await DiscoverItem.find({
    ...(id ? { _id: id } : {}), imported: true, type: 'NEWS', status: 'published',
    deletedAt: null, publishedAt: { $lte: new Date(), $ne: null },
    category: { $in: categories.map(item => item.name) },
    source: { $in: sources.map(item => item._id) }, domains: { $in: discoverDomains },
  }).sort({ publishedAt: -1, _id: -1 }).lean()
  const keys = new Set(), urls = new Set()
  return items.flatMap(item => {
    let canonical
    try { canonical = normalizeArticleUrl(item.sourceUrl) } catch { return [] }
    if (!item.sourceName || urls.has(canonical) || (item.externalKey && keys.has(item.externalKey))) return []
    urls.add(canonical)
    if (item.externalKey) keys.add(item.externalKey)
    return [{ _id: item._id, imported: true, title: item.title, category: item.category,
      description: item.summary, summary: item.summary, sourceName: item.sourceName,
      sourceUrl: item.sourceUrl, publishDate: item.publishedAt, featured: item.featured }]
  })
}
export async function listNews(req, res) {
  const { settings } = await getConfig()
  if (!settings.newsEnabled || !settings.techNewsEnabled) return respond(res, [])
  const query = TechNews.find(publishedNewsQuery()).sort({ publishDate: -1, _id: -1 }).select('-content -keyTakeaways -studentsShouldLearn -careerTip -source')
  const [manual, imported] = await Promise.all([query.lean(), importedNews(settings)])
  const articles = [...manual, ...imported].sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate) || String(b._id).localeCompare(String(a._id)))
  return respond(res, req.query.latest === 'true' ? articles.slice(0, 1) : articles)
}
export async function readNews(req, res) {
  const { settings } = await getConfig()
  if (!settings.newsEnabled || !settings.techNewsEnabled) return fail(res, 'Tech News is currently unavailable.', 404)
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'News article not found', 404)
  const article = await TechNews.findOne({ _id: req.params.id, ...publishedNewsQuery() }).lean()
  const result = article || (await importedNews(settings, req.params.id))[0]
  return result ? respond(res, result) : fail(res, 'News article not found', 404)
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
