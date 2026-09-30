import { recordActivity } from '../services/learning-activity.js'
import mongoose from 'mongoose'
import { DiscoverItem, DiscoverSource, DiscoverCategory, DiscoverRead, ensureDiscoverCategories } from '../models/discover.js'
import { getConfig } from '../models/management.js'
import { respond, fail } from '../utils/api.js'
import { discoverTypes, discoverDomains, discoverTabs, normalizeArticleUrl } from '../../shared/discover.js'
import { validateSourceUrl, safeSourceUrl } from '../services/discover-fetch.js'
import { plainText, refreshDiscoverSources } from '../services/discover-ingest.js'

const pageNumber = value => Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 1))
const validList = (value, allowed) => Array.isArray(value) && value.length > 0 && value.length <= 30 && value.every(item => typeof item === 'string' && (!allowed || allowed.includes(item)))
const itemFields = ['title', 'summary', 'explanation', 'whyItMatters', 'whatYouCanLearn', 'takeaway', 'category', 'domains', 'type', 'status', 'featured', 'trending', 'readTime', 'sourceName', 'sourceUrl', 'publishedAt']
export async function discoverEnabled(_req, res, next) { const { settings } = await getConfig(); if (!settings.newsEnabled || !settings.discoverEnabled) return fail(res, 'Learn & Discover is currently unavailable.', 404); next() }
async function visibleQuery(student) { return { status: 'published', publishedAt: { $lte: new Date() }, domains: { $in: [student.internshipDomain, 'General'] }, category: { $in: (await DiscoverCategory.find({ active: true }).select('name').lean()).map(item => item.name) } } }
function readLookup(student) { return { $lookup: { from: DiscoverRead.collection.name, let: { itemId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$item', '$$itemId'] }, { $eq: ['$student', student._id] }] } } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'reading' } } }
function studentItem(item, read = false) { const { externalKey: _externalKey, __v: _version, reading: _reading, relevance: _relevance, ...safe } = item; return { ...safe, read, isNew: !read && new Date(item.publishedAt).getTime() >= Date.now() - 7 * 86400000 } }
export async function studentFeed(req, res) {
  const tab = Object.hasOwn(discoverTabs, req.query.tab) ? req.query.tab : 'For You'
  const query = await visibleQuery(req.student)
  const page = pageNumber(req.query.page)
  const typedQuery = discoverTabs[tab].length ? { ...query, type: { $in: discoverTabs[tab] } } : query
  const [items, unread, total] = await Promise.all([
    DiscoverItem.aggregate([{ $match: typedQuery }, { $addFields: { relevance: { $cond: [{ $in: [req.student.internshipDomain, '$domains'] }, 1, 0] } } }, { $sort: { relevance: -1, featured: -1, publishedAt: -1, _id: -1 } }, { $skip: (page - 1) * 20 }, { $limit: 20 }, readLookup(req.student)]),
    DiscoverItem.aggregate([{ $match: { ...query, publishedAt: { $gte: new Date(Date.now() - 7 * 86400000), $lte: new Date() } } }, readLookup(req.student), { $match: { reading: { $size: 0 } } }, { $count: 'count' }]),
    DiscoverItem.countDocuments(typedQuery),
  ])
  return respond(res, { items: items.map(item => studentItem(item, item.reading.length > 0)), page, hasMore: page * 20 < total, unreadCount: unread[0]?.count || 0, domain: req.student.internshipDomain })
}
export async function studentDetail(req, res) {
  const item = await DiscoverItem.findOne({ ...await visibleQuery(req.student), _id: req.params.id }).lean()
  if (!item) return fail(res, 'Discovery not found', 404)
  return respond(res, studentItem(item, Boolean(await DiscoverRead.exists({ student: req.student._id, item: item._id }))))
}
export async function markRead(req, res) {
  if (!await DiscoverItem.exists({ ...await visibleQuery(req.student), _id: req.params.id })) return fail(res, 'Discovery not found', 404)
  try { await DiscoverRead.updateOne({ student: req.student._id, item: req.params.id }, { $setOnInsert: { readAt: new Date() } }, { upsert: true }) } catch (error) { if (error.code !== 11000) throw error }
  await recordActivity(req.student._id, 'discovery-read', `discovery:${req.params.id}`, 'Read a learning discovery', 5)
  return respond(res, { read: true })
}
export async function adminItems(req, res) {
  const query = { deletedAt: null }
  if (['draft', 'pending', 'published', 'rejected'].includes(req.query.status)) query.status = req.query.status
  if (discoverTypes.includes(req.query.type)) query.type = req.query.type
  if (typeof req.query.search === 'string' && req.query.search.trim()) query.title = { $regex: req.query.search.slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  const page = pageNumber(req.query.page)
  const [items, total] = await Promise.all([DiscoverItem.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 30).limit(30).lean(), DiscoverItem.countDocuments(query)])
  return respond(res, { items, total, page, hasMore: page * 30 < total })
}
export async function saveItem(req, res) {
  const item = req.params.id ? await DiscoverItem.findById(req.params.id) : new DiscoverItem()
  if (!item || item.deletedAt) return fail(res, 'Discovery not found', 404)
  const body = req.body || {}
  for (const key of itemFields) if (key in body) {
    const value = body[key]
    if (key === 'domains') { if (!validList(value, discoverDomains)) return fail(res, 'Choose valid internship domains.'); item.set(key, [...new Set(value)]); continue }
    if (['featured', 'trending'].includes(key)) { if (typeof value !== 'boolean') return fail(res, 'Flags must be true or false.'); item.set(key, value); continue }
    if (key === 'readTime') { if (!Number.isInteger(value) || value < 1 || value > 15) return fail(res, 'Read time must be 1–15 minutes.'); item.set(key, value); continue }
    if (typeof value !== 'string') return fail(res, 'Content fields must be text.')
    if (key === 'sourceUrl') { if (value) { const normalized = normalizeArticleUrl(value); safeSourceUrl(normalized); item.sourceUrl = normalized } else if (!item.imported) item.sourceUrl = ''; continue }
    if (item.imported && key === 'sourceName') continue // Preserve publisher attribution; editorial fields remain editable.
    if (key === 'publishedAt') { if (Number.isNaN(Date.parse(value))) return fail(res, 'Choose a valid publication date.'); item.publishedAt = new Date(value); continue }
    item.set(key, plainText(value, key === 'explanation' ? 1600 : key === 'title' ? 180 : key === 'sourceName' ? 120 : 600))
  }
  if (!item.title || !item.summary || !validList(item.domains, discoverDomains)) return fail(res, 'Title, summary and at least one domain are required.')
  if (!await DiscoverCategory.exists({ name: item.category, active: true })) return fail(res, 'Choose an active category.')
  if (!discoverTypes.includes(item.type) || !['draft', 'pending', 'published', 'rejected'].includes(item.status)) return fail(res, 'Invalid content type or publishing status.')
  if (item.sourceName !== 'Innovix Projects' && !item.sourceUrl) return fail(res, 'Externally attributed content needs its original source URL.')
  if (item.status === 'published' && (!item.whyItMatters || !item.whatYouCanLearn || !item.takeaway)) return fail(res, 'Add why this matters, what students can learn and a takeaway before publishing.')
  await item.save()
  return respond(res, item, req.params.id ? 200 : 201)
}
export async function deleteItem(req, res) {
  const item = await DiscoverItem.findById(req.params.id).lean()
  if (!item || item.deletedAt) return fail(res, 'Discovery not found', 404)
  if (item.imported) {
    // Retain only a URL hash tombstone so the next refresh cannot resurrect deleted imports.
    const remove = Object.fromEntries(Object.keys(item).filter(key => !['_id', 'externalKey', 'createdAt', 'updatedAt', '__v'].includes(key)).map(key => [key, 1]))
    await DiscoverItem.updateOne({ _id: item._id }, { $set: { deletedAt: new Date() }, $unset: remove })
  } else await DiscoverItem.deleteOne({ _id: item._id })
  await DiscoverRead.deleteMany({ item: item._id })
  return respond(res, { deleted: true })
}
export async function sources(_req, res) { return respond(res, await DiscoverSource.find().sort({ name: 1 }).select('-lease -lockedUntil').lean()) }
export async function saveSource(req, res) {
  const source = req.params.id ? await DiscoverSource.findById(req.params.id) : new DiscoverSource()
  if (!source) return fail(res, 'Source not found', 404)
  const body = req.body || {}
  if ('url' in body) source.url = await validateSourceUrl(body.url)
  if ('name' in body) { if (typeof body.name !== 'string') return fail(res, 'Enter a source name.'); source.name = plainText(body.name, 120) }
  if ('type' in body) { if (!['RSS', 'ATOM', 'JSON_FEED'].includes(body.type)) return fail(res, 'Choose RSS, Atom or JSON Feed.'); source.type = body.type }
  if ('active' in body) { if (typeof body.active !== 'boolean') return fail(res, 'Active must be true or false.'); source.active = body.active }
  for (const key of ['domains', 'categories']) if (key in body) {
    const allowed = key === 'domains' ? discoverDomains : (await DiscoverCategory.find({ active: true }).lean()).map(item => item.name)
    if (!validList(body[key], allowed)) return fail(res, `Choose allowed ${key}.`)
    source.set(key, [...new Set(body[key])])
  }
  if (!source.name || !source.url || !source.type || !source.categories.length || !source.domains.length) return fail(res, 'Complete the source name, feed, type, categories and domain mapping.')
  // Editing invalidates an in-flight worker; it may not import under stale trust settings.
  source.lease = undefined; source.lockedUntil = null
  await source.save()
  return respond(res, source.toObject({ useProjection: true }), req.params.id ? 200 : 201)
}
export async function deleteSource(req, res) { const item = await DiscoverSource.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true, note: 'Previously imported content is retained for review.' }) : fail(res, 'Source not found', 404) }
export async function categories(_req, res) { await ensureDiscoverCategories(); return respond(res, await DiscoverCategory.find().sort({ name: 1 }).lean()) }
export async function saveCategory(req, res) {
  const item = req.params.id ? await DiscoverCategory.findById(req.params.id) : new DiscoverCategory()
  if (!item) return fail(res, 'Category not found', 404)
  const body = req.body || {}
  if ('name' in body) {
    if (typeof body.name !== 'string' || !plainText(body.name, 80)) return fail(res, 'Enter a category name.')
    const name = plainText(body.name, 80)
    if (!item.isNew && name !== item.name && (await DiscoverItem.exists({ category: item.name }) || await DiscoverSource.exists({ categories: item.name }))) return fail(res, 'This category is in use. Keep its name; edit its domains or keywords instead.', 409)
    item.name = name
  }
  if ('domains' in body) { if (!validList(body.domains, discoverDomains)) return fail(res, 'Choose valid domains.'); item.domains = [...new Set(body.domains)] }
  if ('keywords' in body) { if (!Array.isArray(body.keywords) || body.keywords.length > 50 || body.keywords.some(word => typeof word !== 'string' || word.length > 60)) return fail(res, 'Use up to 50 short keywords.'); item.keywords = body.keywords.map(word => plainText(word, 60).toLowerCase()).filter(Boolean) }
  if ('active' in body) { if (typeof body.active !== 'boolean') return fail(res, 'Active must be true or false.'); item.active = body.active }
  if (!item.domains.length) return fail(res, 'Choose at least one domain.')
  await item.save()
  return respond(res, item, req.params.id ? 200 : 201)
}
export async function deleteCategory(req, res) {
  const item = await DiscoverCategory.findById(req.params.id)
  if (!item) return fail(res, 'Category not found', 404)
  if (await DiscoverItem.exists({ category: item.name }) || await DiscoverSource.exists({ categories: item.name })) return fail(res, 'This category is in use. Disable it or move its content and sources first.', 409)
  await item.deleteOne(); return respond(res, { deleted: true })
}
export async function refreshSources(_req, res) { return respond(res, await refreshDiscoverSources()) }
export function discoverId(req, res, next) { if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Record not found', 404); next() }
export function discoverError(error, _req, res, _next) {
  if (error.code === 11000) return fail(res, 'This source or category already exists.', 409)
  if (['ValidationError', 'CastError', 'TypeError'].includes(error.name) || /URL|hostname|network|DNS|Source resolves/.test(error.message)) return fail(res, 'Check the content fields and use a valid public HTTPS feed URL.', 400)
  return fail(res, 'Learn & Discover could not complete this request. Please try again.', 500)
}
