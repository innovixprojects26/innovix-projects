import mongoose from 'mongoose'
import { Event, eventCategories, eventStatuses, eventDate, eventUrl } from '../models/event.js'
import { respond, fail } from '../utils/api.js'

const lengths = { title: 160, category: 40, description: 2000, posterUrl: 2048, registrationUrl: 2048, status: 20 }
const fields = [...Object.keys(lengths), 'eventDate', 'isFree', 'enabled']
function validate(body, creating) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) return 'Provide event fields.'
  if (Object.keys(body).some(key => !fields.includes(key))) return 'Unknown event field.'
  if (creating && ['title', 'category', 'description', 'eventDate'].some(key => !Object.hasOwn(body, key))) return 'Title, category, description and eventDate are required.'
  for (const [key, value] of Object.entries(body)) {
    if (key === 'enabled' || key === 'isFree') {
      if (typeof value !== 'boolean') return `${key} must be a boolean.`
    } else if (key === 'eventDate') {
      if (!eventDate(value)) return 'eventDate must be a valid ISO date or timestamp with timezone.'
    } else {
      if (typeof value !== 'string' || value.length > lengths[key]) return `${key} must be text of at most ${lengths[key]} characters.`
      if (['title', 'category', 'description', 'status'].includes(key) && !value.trim()) return `${key} is required.`
      if (key === 'category' && !eventCategories.includes(value)) return 'Invalid event category.'
      if (key === 'status' && !eventStatuses.includes(value)) return 'Invalid publication status.'
      if (['posterUrl', 'registrationUrl'].includes(key) && !eventUrl(value)) return 'URLs must use HTTP or HTTPS without credentials.'
    }
  }
}

export async function listEvents(_req, res) {
  res.set('Cache-Control', 'no-store')
  return respond(res, await Event.find({ enabled: true, status: 'published' }).sort({ eventDate: 1, _id: 1 }).select('-__v').lean())
}
export async function adminEvents(_req, res) {
  return respond(res, await Event.find().sort({ createdAt: -1, _id: -1 }).lean())
}
export async function saveEvent(req, res) {
  const error = validate(req.body, !req.params.id)
  if (error) return fail(res, error)
  if (req.params.id && !mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Event not found', 404)
  try {
    const item = req.params.id
      ? await Event.findByIdAndUpdate(req.params.id, { $set: req.body }, { returnDocument: 'after', runValidators: true })
      : await Event.create(req.body)
    return item ? respond(res, item, req.params.id ? 200 : 201) : fail(res, 'Event not found', 404)
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') return fail(res, 'Invalid event fields.')
    throw error
  }
}
export async function deleteEvent(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Event not found', 404)
  const item = await Event.findByIdAndDelete(req.params.id)
  return item ? respond(res, { deleted: true }) : fail(res, 'Event not found', 404)
}
