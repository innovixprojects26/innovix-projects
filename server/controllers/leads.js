import { Enquiry } from '../models/index.js'
import { leadStatuses } from '../../shared/learning.js'
import { respond } from '../utils/api.js'
import { problem } from '../services/learning-access.js'

export async function leads(req, res) {
  const now = new Date(), filter = {}
  if (leadStatuses.includes(req.query.status)) filter.status = req.query.status
  if (req.query.due === 'true') Object.assign(filter, { followUpDate: { $lte: now }, status: { $nin: ['Completed', 'Closed', 'Converted'] } })
  const [items, summary] = await Promise.all([Enquiry.find(filter).populate('project', 'title price slug').sort({ createdAt: -1 }).limit(500).lean(), Promise.all([Enquiry.countDocuments({ status: 'New' }), Enquiry.countDocuments({ followUpDate: { $lte: now }, status: { $nin: ['Completed', 'Closed', 'Converted'] } }), Enquiry.countDocuments({ status: 'Interested' }), Enquiry.countDocuments({ status: { $in: ['Confirmed', 'Converted'] } }), Enquiry.countDocuments({ status: 'Completed' })])])
  return respond(res, { items, summary: Object.fromEntries(['New Leads', 'Follow-ups Due', 'Interested Leads', 'Confirmed Projects', 'Completed Projects'].map((key, i) => [key, summary[i]])) })
}
export async function updateLead(req, res) {
  const { status, note, followUpDate } = req.body
  if (status !== undefined && !leadStatuses.includes(status)) throw problem('Choose a valid lead status.')
  if (note !== undefined && (typeof note !== 'string' || note.length > 4000)) throw problem('Notes must be at most 4000 characters.')
  if (followUpDate && !Number.isFinite(Date.parse(followUpDate))) throw problem('Enter a valid follow-up date.')
  const update = { $set: {}, $push: {} }
  if (status) { update.$set.status = status; update.$push.statusHistory = { status, changedAt: new Date() } }
  if (followUpDate !== undefined) update.$set.followUpDate = followUpDate || null
  if (note?.trim()) update.$push.internalNotes = { text: note.trim(), createdAt: new Date() }
  if (!Object.keys(update.$push).length) delete update.$push
  const item = await Enquiry.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after', runValidators: true })
  if (!item) throw problem('Lead not found.', 404)
  return respond(res, item)
}
