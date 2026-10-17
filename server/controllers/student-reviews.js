import mongoose from 'mongoose'
import { StudentReview, reviewAvatarUrl } from '../models/student-review.js'
import { respond, fail } from '../utils/api.js'

const lengths = { studentName: 120, domain: 120, reviewText: 2000, avatarUrl: 2048 }
const fields = [...Object.keys(lengths), 'rating', 'approved', 'enabled', 'verified']
const privateFields = '+verificationEvidence +verifiedBy +verifiedAt'
const clearVerification = { verificationEvidence: 1, verifiedBy: 1, verifiedAt: 1 }
function validate(body, creating) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) return 'Provide review fields.'
  if (Object.keys(body).some(key => !fields.includes(key))) return 'Unknown review field.'
  if (creating && ['studentName', 'domain', 'rating', 'reviewText'].some(key => !Object.hasOwn(body, key))) return 'Student name, domain, rating and review text are required.'
  for (const [key, value] of Object.entries(body)) {
    if (key === 'rating') { if (!Number.isInteger(value) || value < 1 || value > 5) return 'Rating must be an integer from 1 to 5.' }
    else if (['approved', 'enabled', 'verified'].includes(key)) {
      if (typeof value !== 'boolean') return `${key} must be a boolean.`
      if (key === 'verified' && value) return 'Use the explicit verification endpoint with evidence.'
    } else {
      if (typeof value !== 'string' || value.length > lengths[key] || (key !== 'avatarUrl' && !value.trim())) return `Invalid ${key} (maximum ${lengths[key]} characters).`
      if (key === 'avatarUrl' && !reviewAvatarUrl(value)) return 'Avatar URL must use HTTP(S) without credentials or spaces.'
    }
  }
}
export async function publicReviews(_req, res) {
  res.set('Cache-Control', 'no-store')
  return respond(res, await StudentReview.find({ approved: true, enabled: true, verified: true })
    .select('studentName domain rating reviewText avatarUrl verified createdAt updatedAt').sort({ createdAt: -1, _id: -1 }).lean())
}
export async function adminReviews(_req, res) {
  return respond(res, await StudentReview.find().select(privateFields).sort({ createdAt: -1, _id: -1 }).lean())
}
export async function saveReview(req, res) {
  const error = validate(req.body, !req.params.id)
  if (error) return fail(res, error)
  if (req.params.id && !mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Review not found', 404)
  const values = { ...req.body }
  for (const key of ['studentName', 'domain', 'reviewText']) if (key in values) values[key] = values[key].trim()
  // Content/identity changes must be reviewed and verified again, even when
  // the request also asks for approval. Atomic update prevents stale verification.
  const changedContent = req.params.id && [...Object.keys(lengths), 'rating'].some(key => key in values)
  if (changedContent) { values.verified = false; values.approved = false }
  try {
    const item = req.params.id ? await StudentReview.findByIdAndUpdate(req.params.id,
      { $set: values, ...(values.verified === false ? { $unset: clearVerification } : {}) },
      { returnDocument: 'after', runValidators: true }).select(privateFields) : await StudentReview.create(values)
    return item ? respond(res, item, req.params.id ? 200 : 201) : fail(res, 'Review not found', 404)
  } catch (error) {
    if (['ValidationError', 'CastError'].includes(error.name)) return fail(res, 'Invalid review fields.')
    throw error
  }
}
// POST /admin/student-reviews/:id/verify
// Admin must supply a private evidence summary/reference and the updatedAt
// version they inspected. The API records the attestation, not an automatic check.
export async function verifyReview(req, res) {
  const body = req.body
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !['evidence', 'updatedAt'].includes(key)) ||
      typeof body.evidence !== 'string' || !body.evidence.trim() || body.evidence.length > 2000 ||
      typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))) return fail(res, 'Provide verification evidence and the reviewed updatedAt timestamp.')
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Review not found', 404)
  if (!req.admin?.id) return fail(res, 'Administrator identity required', 403)
  const item = await StudentReview.findOneAndUpdate({ _id: req.params.id, updatedAt: new Date(body.updatedAt) },
    { $set: { verified: true, verificationEvidence: body.evidence.trim(), verifiedBy: String(req.admin.id), verifiedAt: new Date() } },
    { returnDocument: 'after', runValidators: true }).select(privateFields)
  if (item) return respond(res, item)
  return await StudentReview.exists({ _id: req.params.id }) ? fail(res, 'Review changed. Inspect the latest version before verifying.', 409) : fail(res, 'Review not found', 404)
}
export async function deleteReview(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return fail(res, 'Review not found', 404)
  return await StudentReview.findByIdAndDelete(req.params.id) ? respond(res, { deleted: true }) : fail(res, 'Review not found', 404)
}
