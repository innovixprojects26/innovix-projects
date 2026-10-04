import mongoose from 'mongoose'
import { internshipIndicators } from '../services/internship-indicators.js'
import { normalizeInternshipDomain } from '../../shared/internship-domain.js'
import { WebsiteConfig, InternshipDomain, Announcement, AdminActivity, getConfig, ensureDomains, settingDefaults, homepageDefaults } from '../models/management.js'
import { Student, StudentSession, studentDto } from '../models/student.js'
import { Admin } from '../models/index.js'
import { fail, respond, validateEmail, validateUrl } from '../utils/api.js'

export async function publicConfiguration(_req, res) {
  await ensureDomains()

  const now = new Date()

  const [config, domains, announcements, indicators] = await Promise.all([
    getConfig(),

    InternshipDomain.find({
      active: true
    }).lean(),

    Announcement.find({
      active: true,
      $and: [
        {
          $or: [
            { startDate: null },
            { startDate: { $lte: now } }
          ]
        },
        {
          $or: [
            { endDate: null },
            { endDate: { $gte: now } }
          ]
        }
      ]
    })
      .sort({ createdAt: -1 })
      .lean(),
    internshipIndicators()
  ])

  res.set('Cache-Control', 'no-store')

  return respond(res, {
    ...config,

    services: config.services.filter(
      item => item.active !== false
    ),

    domains: domains.map(item => ({
      ...item,
      enrollmentCount: indicators[normalizeInternshipDomain(item.name)]?.enrollmentCount ?? 0,

      // Send meeting URL for all domains where live class is enabled
      meetingUrl: item.liveClassEnabled
        ? item.meetingUrl
        : ''
    })),

    announcements
  })
}
export async function readConfig(_req, res) { res.set('Cache-Control', 'no-store'); return respond(res, await getConfig()) }
export async function saveConfig(req, res) {
  const { section } = req.params
  if (!['settings', 'homepage', 'services'].includes(section)) return fail(res, 'Unknown settings section', 404)
  const value = req.body
  if (!value || typeof value !== 'object' || (section !== 'services' && Array.isArray(value))) return fail(res, 'Invalid settings payload')
  if (section === 'services') {
    if (!Array.isArray(value) || value.length > 30 || value.some(item => !item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160 || typeof item.description !== 'string' || item.description.length > 2000 || typeof item.active !== 'boolean')) return fail(res, 'Enter valid service titles, descriptions and active states.')
    await WebsiteConfig.updateOne({ _id: 'website' }, { $set: { services: value.map(({ title, description, active }) => ({ title: title.trim(), description: description.trim(), active })) } }, { upsert: true, runValidators: true })
  } else {
    const defaults = section === 'settings' ? settingDefaults : homepageDefaults
    const update = {}
    for (const [key, input] of Object.entries(value)) {
      if (!Object.hasOwn(defaults, key)) return fail(res, 'Unknown setting')
      if (typeof input !== typeof defaults[key] || (typeof input === 'string' && input.length > 2000)) return fail(res, 'Invalid setting value')
      if (key === 'discoverPublishingMode' && !['manual', 'auto'].includes(input)) return fail(res, 'Choose Manual Approval or Auto Publish Trusted Sources.')
      if (key.endsWith('Url') && !validateUrl(input)) return fail(res, 'Social links must use http(s).')
      if (key === 'supportEmail' && !validateEmail(input)) return fail(res, 'Enter a valid support email.')
      if (key === 'whatsapp' && !/^\d{7,15}$/.test(input)) return fail(res, 'WhatsApp number must contain 7–15 digits including country code.')
      update[`${section}.${key}`] = typeof input === 'string' ? input.trim() : input
    }
    await WebsiteConfig.updateOne({ _id: 'website' }, { $set: update }, { upsert: true, runValidators: true })
  }
  return respond(res, await getConfig())
}
export async function listDomains(_req, res) { await ensureDomains(); return respond(res, await InternshipDomain.find().sort({ name: 1 }).lean()) }
export async function updateDomain(req, res) {
  const item = await InternshipDomain.findById(req.params.id)
  if (!item) return fail(res, 'Internship not found', 404)
  for (const key of ['active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled', 'classActive', 'classTitle', 'meetingUrl', 'date', 'startTime', 'description']) {
    if (!(key in req.body)) continue
    const value = req.body[key]
    const boolean = ['active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled', 'classActive'].includes(key)
    if (typeof value !== (boolean ? 'boolean' : 'string') || (!boolean && value.length > 2000)) return fail(res, 'Invalid internship setting')
    if (key === 'meetingUrl' && !validateUrl(value)) return fail(res, 'Meeting URL must use http(s).')
    if (key === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) return fail(res, 'Enter a valid class date.')
    if (key === 'startTime' && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fail(res, 'Enter a valid start time.')
    item.set(key, value)
  }
  await item.save()
  return respond(res, item)
}
export async function students(req, res) {
  const query = {}
  if (['active', 'suspended'].includes(req.query.status)) query.accountStatus = req.query.status
  if (typeof req.query.domain === 'string' && req.query.domain) query.internshipDomain = req.query.domain
  if (typeof req.query.search === 'string' && req.query.search) {
    const escaped = req.query.search.slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.$or = ['fullName', 'email', 'studentId', 'college'].map(key => ({ [key]: { $regex: escaped, $options: 'i' } }))
  }
  const items = await Student.find(query).sort({ createdAt: -1 }).lean()
  return respond(res, items.map(item => ({ _id: item._id, ...studentDto(item) })))
}
export async function studentStatus(req, res) {
  if (!['active', 'suspended'].includes(req.body.accountStatus)) return fail(res, 'Invalid account status')
  const item = await Student.findByIdAndUpdate(req.params.id, { $set: { accountStatus: req.body.accountStatus }, $inc: { authVersion: 1 }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 } }, { returnDocument: 'after' })
  if (!item) return fail(res, 'Student not found', 404)
  await StudentSession.deleteMany({ student: item._id })
  return respond(res, { _id: item._id, ...studentDto(item) })
}
export async function announcements(_req, res) { return respond(res, await Announcement.find().sort({ createdAt: -1 }).lean()) }
export async function saveAnnouncement(req, res) {
  const item = req.params.id ? await Announcement.findById(req.params.id) : new Announcement()
  if (!item) return fail(res, 'Announcement not found', 404)
  for (const key of ['title', 'message', 'type', 'startDate', 'endDate', 'active']) if (key in req.body) {
    if (typeof req.body[key] !== (key === 'active' ? 'boolean' : 'string')) return fail(res, 'Invalid announcement field')
    item.set(key, ['startDate', 'endDate'].includes(key) && !req.body[key] ? null : req.body[key])
  }
  if (item.startDate && item.endDate && item.endDate < item.startDate) return fail(res, 'End date must follow start date.')
  try { await item.save(); return respond(res, item, req.params.id ? 200 : 201) } catch (error) { if (error.name === 'ValidationError') return fail(res, 'Enter a title, message, valid type and dates.'); throw error }
}
export async function deleteAnnouncement(req, res) { const item = await Announcement.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Announcement not found', 404) }
export async function adminProfile(req, res) { const item = await Admin.findById(req.admin.id).select('email role').lean(); return item ? respond(res, item) : fail(res, 'Admin not found', 404) }
export async function activity(_req, res) { return respond(res, await AdminActivity.find().sort({ createdAt: -1 }).limit(100).lean()) }
export function validateId(req, res, next) { if (req.params.id && !mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Record not found', 404); next() }
// Only action names and resource IDs are captured, never request bodies or credentials.
export function audit(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  let createdId
  const json = res.json.bind(res)
  res.json = value => { if (value?.data?._id) createdId = String(value.data._id); return json(value) }
  res.once('finish', () => {
    if (res.statusCode >= 400) return
    const switches = ['available', 'published', 'featured', 'trending', 'popular', 'active', 'applicationsOpen', 'liveClassEnabled', 'recordedClassesEnabled', 'classActive', ...Object.keys(settingDefaults).filter(key => typeof settingDefaults[key] === 'boolean')]
    const changes = switches.filter(key => typeof req.body?.[key] === 'boolean').map(key => `${key}=${req.body[key]}`)
    if (['active', 'suspended'].includes(req.body?.accountStatus)) changes.push(`accountStatus=${req.body.accountStatus}`)
    if (['draft', 'published'].includes(req.body?.status)) changes.push(`status=${req.body.status}`)
    if (typeof req.body?.meetingUrl === 'string') changes.push('meeting link updated')
    const resource = req.path.split('/').filter(Boolean).filter(part => !mongoose.isObjectIdOrHexString(part)).join(' / ')
    AdminActivity.create({ action: `${req.method} ${resource}${changes.length ? ': ' + changes.join(', ') : ''}`, target: createdId || req.path.split('/').find(part => mongoose.isObjectIdOrHexString(part)) || 'website' }).catch(() => console.error('Admin activity could not be recorded'))
  })
  next()
}
