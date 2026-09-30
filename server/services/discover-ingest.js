import { createHash, randomUUID } from 'node:crypto'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { DiscoverItem, DiscoverSource, DiscoverCategory, ensureDiscoverCategories } from '../models/discover.js'
import { getConfig } from '../models/management.js'
import { fetchSource, safeSourceUrl, FETCH_LIMIT } from './discover-fetch.js'
import { normalizeArticleUrl } from '../../shared/discover.js'

export function plainText(input, limit = 600) {
  const value = typeof input === 'string' ? input : typeof input?.['#text'] === 'string' ? input['#text'] : ''
  // oxlint-disable-next-line no-control-regex -- remove non-printing feed characters before storage
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => { const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '' }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[key]).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}
const array = value => value ? Array.isArray(value) ? value : [value] : []
export function parseFeed(text, type) {
  if (Buffer.byteLength(text) > FETCH_LIMIT) throw new Error('Feed exceeds size limit.')
  let entries
  if (type === 'JSON_FEED') {
    const feed = JSON.parse(text)
    if (!/^https:\/\/jsonfeed.org\/version\//.test(feed.version || '') || !Array.isArray(feed.items)) throw new Error('Expected JSON Feed format.')
    entries = feed.items.map(item => ({ title: item.title, url: item.url || item.external_url, summary: item.summary, date: item.date_published }))
  } else {
    let depth = 0
    let elements = 0
    for (const token of text.matchAll(/<\/?[A-Za-z][^>]*>/g)) {
      if (++elements > 30000) throw new Error('Feed has too many XML elements.')
      if (token[0].startsWith('</')) depth--; else if (!token[0].endsWith('/>') && ++depth > 40) throw new Error('Feed XML nesting exceeds limit.')
    }
    if (/<!\s*(DOCTYPE|ENTITY)/i.test(text)) throw new Error('DTD and entity declarations are not supported.')
    if (XMLValidator.validate(text) !== true) throw new Error('Invalid XML feed.')
    const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false, removeNSPrefix: true }).parse(text)
    if (type === 'RSS' && parsed.rss?.channel) entries = array(parsed.rss.channel.item).map(item => ({ title: item.title, url: item.link, summary: item.description, date: item.pubDate }))
    else if (type === 'ATOM' && parsed.feed) entries = array(parsed.feed.entry).map(item => ({ title: item.title, url: array(item.link).find(link => !link['@_rel'] || link['@_rel'] === 'alternate')?.['@_href'], summary: item.summary, date: item.published || item.updated }))
    else throw new Error('Feed does not match the selected RSS/Atom type.')
  }
  return entries.slice(0, 30).flatMap(entry => {
    try {
      const title = plainText(entry.title, 180)
      if (!title || typeof entry.url !== 'string') return []
      const url = normalizeArticleUrl(entry.url.trim())
      safeSourceUrl(url)
      // Never use content:encoded, Atom content, or JSON content_html/full articles.
      const summary = plainText(entry.summary, 400).split(/\s+/).slice(0, 40).join(' ')
      const date = new Date(entry.date)
      return [{ title, url, summary, date: Number.isNaN(date.getTime()) ? null : date }]
    } catch { return [] }
  })
}
export function mapEntry(entry, source, categories) {
  const text = `${entry.title} ${entry.summary}`.toLowerCase()
  const choices = categories.filter(category => category.active && source.categories.includes(category.name) && category.domains.some(domain => source.domains.includes(domain))).map(category => ({ category, score: category.keywords.reduce((score, word) => {
    const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return score + (new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(text) ? 1 : 0)
  }, 0) })).sort((a, b) => b.score - a.score)
  const category = choices[0]?.score ? choices[0].category : choices.find(item => item.category.domains.includes('General') && source.domains.includes('General'))?.category || choices[0]?.category
  if (!category) return null
  const domains = category.domains.filter(domain => source.domains.includes(domain))
  if (!domains.length) return null
  return { category: category.name, domains }
}

export async function ingestSource(id, { fetcher = fetchSource, now = new Date() } = {}) {
  if (!(await getConfig()).settings.discoverImportEnabled) return { skipped: true, reason: 'External import is disabled.' }
  const lease = randomUUID()
  const source = await DiscoverSource.findOneAndUpdate({ _id: id, active: true, $and: [{ $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }, { $or: [{ nextFetchAt: null }, { nextFetchAt: { $lte: now } }] }] }, { $set: { lease, lockedUntil: new Date(now.getTime() + 120000), fetchStatus: 'Fetching', fetchError: '' } }, { returnDocument: 'after' }).lean()
  if (!source) return { skipped: true, reason: 'Source disabled, busy or refreshed within 15 minutes.' }
  let imported = 0
  let duplicates = 0
  let skipped = 0
  try {
    const response = await fetcher(source.url)
    const entries = parseFeed(response.text, source.type)
    const categories = await DiscoverCategory.find({ active: true }).lean()
    await DiscoverItem.init()
    for (const entry of entries) {
      // Recheck switches and source ownership before inserting every item.
      const settings = (await getConfig()).settings
      if (!settings.discoverImportEnabled || !await DiscoverSource.exists({ _id: id, active: true, lease })) break
      const mapping = mapEntry(entry, source, categories)
      if (!mapping) { skipped++; continue }
      const externalKey = createHash('sha256').update(entry.url).digest('hex')
      try {
        const result = await DiscoverItem.updateOne({ externalKey }, { $setOnInsert: {
          externalKey, title: entry.title, originalTitle: entry.title, summary: entry.summary || `${source.name} published an update: ${entry.title}`, explanation: '', whyItMatters: `This update relates to ${mapping.category}. Check the original publisher for context before applying it.`, whatYouCanLearn: 'Identify one concept from the update and explore its official documentation.', takeaway: 'Separate the publisher’s claims from your own conclusions, and verify details before using them.',
          ...mapping, type: 'NEWS', source: source._id, sourceName: source.name, sourceUrl: entry.url, imported: true, status: settings.discoverPublishingMode === 'auto' ? 'published' : 'pending', publishedAt: entry.date || now, retrievedAt: now, featured: false, trending: false, readTime: 2,
        } }, { upsert: true, runValidators: true })
        if (result.upsertedCount) imported++; else duplicates++
      } catch (error) { if (error.code === 11000) duplicates++; else throw error }
    }
    await DiscoverSource.updateOne({ _id: id, lease }, { $set: { lastFetchedAt: now, nextFetchAt: new Date(now.getTime() + 900000), fetchStatus: 'Success', fetchError: '', lockedUntil: null }, $unset: { lease: 1 } })
    return { imported, duplicates, skipped }
  } catch {
    // Do not persist raw transport errors which might contain infrastructure details.
    await DiscoverSource.updateOne({ _id: id, lease }, { $set: { lastFetchedAt: now, nextFetchAt: new Date(now.getTime() + 900000), fetchStatus: 'Failed', fetchError: 'Fetch or parsing failed. Check the HTTPS feed URL, format, size and public reachability.', lockedUntil: null }, $unset: { lease: 1 } })
    return { failed: true }
  }
}
export async function refreshDiscoverSources(options = {}) {
  if (!(await getConfig()).settings.discoverImportEnabled) return { disabled: true, results: [] }
  await ensureDiscoverCategories()
  const now = new Date()
  const sources = await DiscoverSource.find({ active: true, $or: [{ nextFetchAt: null }, { nextFetchAt: { $lte: now } }] }).sort({ lastFetchedAt: 1 }).limit(10).select('_id name').lean()
  const results = []
  for (const source of sources) results.push({ id: source._id, name: source.name, ...await ingestSource(source._id, options) })
  return { results }
}
