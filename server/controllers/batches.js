import mongoose from 'mongoose'
import { InternshipBatch, BatchEnrollment, InternshipTask } from '../models/learning.js'
import { Student } from '../models/student.js'
import { ContentVideo } from '../models/content-video.js'
import { InternshipApplication } from '../models/index.js'
import { getDomain } from '../models/management.js'
import { problem, id } from '../services/learning-access.js'
import { respond } from '../utils/api.js'
import { batchStatuses } from '../../shared/learning.js'
import { recordActivity } from '../services/learning-activity.js'
import { notifyStudent } from '../services/learning-notifications.js'

export async function batches(_req, res) { return respond(res, await InternshipBatch.find().sort({ startDate: -1 }).limit(500).lean()) }
export async function saveBatch(req, res) {
  const current = req.params.id ? await InternshipBatch.findById(req.params.id) : new InternshipBatch()
  if (!current) throw problem('Batch not found.', 404)
  if (current.status === 'Completed') throw problem('Completed batches are preserved as historical records.', 409)
  const fields = ['name', 'domain', 'code', 'startDate', 'endDate', 'duration', 'mentor', 'description', 'maxStudents', 'applicationDeadline', 'status', 'enabled', 'requiredVideos']
  const value = { ...current.toObject(), ...Object.fromEntries(fields.filter(key => key in req.body).map(key => [key, req.body[key]])) }
  if (!['name', 'domain', 'code', 'mentor'].every(key => typeof value[key] === 'string' && value[key].trim())) throw problem('Enter a batch name, domain, code and mentor.')
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(value.code)) throw problem('Use 3–40 letters, numbers, hyphens or underscores for the batch code.')
  if (!(await getDomain(value.domain))?.active) throw problem('Choose an active internship domain.')
  if (!Number.isInteger(value.maxStudents) || value.maxStudents < Math.max(1, current.enrollmentCount || 0) || value.maxStudents > 10000) throw problem('Capacity must accommodate enrolled students (1–10000).')
  if (!batchStatuses.includes(value.status) || typeof value.enabled !== 'boolean') throw problem('Choose a valid status and enabled state.')
  if (!Number.isFinite(Date.parse(value.startDate)) || !Number.isFinite(Date.parse(value.endDate)) || new Date(value.endDate) <= new Date(value.startDate)) throw problem('End date must be after the start date.')
  if (value.applicationDeadline && (!Number.isFinite(Date.parse(value.applicationDeadline)) || new Date(value.applicationDeadline) > new Date(value.startDate))) throw problem('Application deadline must be on or before the start date.')
  if (!Array.isArray(value.requiredVideos) || value.requiredVideos.some(video => !id(video))) throw problem('Choose valid required videos.')
  if (value.requiredVideos.length && (value.domain !== 'Content Creation' || await ContentVideo.countDocuments({ _id: { $in: value.requiredVideos }, status: 'published', duration: { $gt: 0 } }) !== new Set(value.requiredVideos.map(String)).size)) throw problem('Required videos must be published Content Creation videos with a known duration.')
  if (current.enrollmentCount && (value.domain !== current.domain || value.status === 'Draft')) throw problem('An enrolled batch cannot change domain or return to draft.', 409)
  if (value.status === 'Completed' && new Date(value.endDate) > new Date()) throw problem('A batch can be completed only after its end date.')
  current.set(Object.fromEntries(fields.map(key => [key, key === 'applicationDeadline' ? value[key] || undefined : value[key]])))
  if (current.status === 'Cancelled') current.enrollmentCount = 0
  await mongoose.connection.transaction(async session => {
    if (!current.isNew) {
      const latest = await InternshipBatch.findById(current._id).session(session).lean()
      if (!latest || latest.status === 'Completed') throw problem('This batch changed. Refresh before editing.', 409)
      if (latest.enrollmentCount > value.maxStudents || (latest.enrollmentCount && (latest.domain !== value.domain || value.status === 'Draft'))) throw problem('The batch now has enrolled students. Refresh its capacity and status.', 409)
    }
    await current.save({ session })
    if (['Completed', 'Cancelled'].includes(current.status)) await BatchEnrollment.updateMany({ batch: current._id, status: 'Enrolled' }, { $set: { status: current.status === 'Completed' ? 'Completed' : 'Removed', endedAt: new Date() } }, { session })
  })
  if (current.status === 'Completed') for (const row of await BatchEnrollment.find({ batch: current._id, status: 'Completed' }).select('student').lean()) await recordActivity(row.student, 'internship-completed', `batch-completed:${current._id}`, `Completed: ${current.name}`, 100)
  return respond(res, current)
}
export async function deleteBatch(req, res) {
  const item = await InternshipBatch.findById(req.params.id)
  if (!item) throw problem('Batch not found.', 404)
  if (item.status !== 'Draft' || await BatchEnrollment.exists({ batch: item._id }) || await InternshipTask.exists({ batch: item._id })) throw problem('Only an unused draft batch can be deleted.', 409)
  const removed = await InternshipBatch.findOneAndDelete({ _id: item._id, status: 'Draft', enrollmentCount: 0 })
  if (!removed) throw problem('The batch changed. Refresh before deleting.', 409)
  return respond(res, { deleted: true })
}
export async function batchStudents(req, res) {
  return respond(res, await BatchEnrollment.find({ batch: req.params.id }).populate('student', 'studentId fullName internshipDomain').sort({ createdAt: -1 }).lean())
}
export async function assignStudent(req, res) {
  if (typeof req.body.studentId !== 'string') throw problem('Choose a student.')
  if (req.body.transfer !== undefined && typeof req.body.transfer !== 'boolean') throw problem('Choose a valid transfer option.')
  const student = await Student.findOne({ $or: [{ studentId: req.body.studentId }, ...(id(req.body.studentId) ? [{ _id: req.body.studentId }] : [])], accountStatus: 'active' })
  if (!student) throw problem('Active student not found.', 404)
  let assigned
  await mongoose.connection.transaction(async session => {
    const batch = await InternshipBatch.findById(req.params.id).session(session)
    if (!batch || !batch.enabled || !['Upcoming', 'Active'].includes(batch.status)) throw problem('Choose an enabled upcoming or active batch.')
    if (batch.domain !== student.internshipDomain) throw problem('The batch must match the student’s internship domain.')
    let application
    if (req.body.applicationId) {
      if (!id(req.body.applicationId)) throw problem('Invalid application.')
      application = await InternshipApplication.findOne({ _id: req.body.applicationId, email: student.email, domain: batch.domain, status: { $in: ['Selected', 'Joined'] } }).session(session)
      if (!application) throw problem('Select an approved application belonging to this student and domain.')
    }
    const previous = await BatchEnrollment.findOne({ student: student._id, status: 'Enrolled' }).session(session)
    if (previous && (!req.body.transfer || String(previous.batch) === String(batch._id))) throw problem('Student is already enrolled. Use Transfer to change batches.', 409)
    const reserved = await InternshipBatch.updateOne({ _id: batch._id, $expr: { $lt: ['$enrollmentCount', '$maxStudents'] } }, { $inc: { enrollmentCount: 1 } }, { session })
    if (!reserved.modifiedCount) throw problem('This batch is full.', 409)
    if (previous) {
      previous.status = 'Transferred'; previous.endedAt = new Date(); await previous.save({ session })
      await InternshipBatch.updateOne({ _id: previous.batch }, { $inc: { enrollmentCount: -1 } }, { session })
    }
    ;[assigned] = await BatchEnrollment.create([{ student: student._id, batch: batch._id, ...(application ? { application: application._id } : {}) }], { session })
    if (application) { application.status = 'Joined'; await application.save({ session }) }
  })
  const batchName = (await InternshipBatch.findById(assigned.batch).select('name').lean()).name
  await notifyStudent(student._id, `batch:${assigned._id}`, 'Batch Assigned', `You have been assigned to ${batchName}.`, '/student/internship')
  return respond(res, assigned, 201)
}
export async function removeStudent(req, res) {
  await mongoose.connection.transaction(async session => {
    const item = await BatchEnrollment.findOne({ _id: req.params.enrollmentId, batch: req.params.id, status: 'Enrolled' }).session(session)
    if (!item) throw problem('Active enrollment not found. History cannot be removed.', 404)
    item.status = 'Removed'; item.endedAt = new Date(); await item.save({ session })
    await InternshipBatch.updateOne({ _id: item.batch }, { $inc: { enrollmentCount: -1 } }, { session })
  })
  return respond(res, { removed: true })
}
