import mongoose from 'mongoose'
import { getConfig } from '../models/management.js'
import { BatchEnrollment, InternshipTask, InternshipBatch } from '../models/learning.js'
export const problem = (message, status = 400) => Object.assign(new Error(message), { status })
export const id = value => mongoose.isObjectIdOrHexString(value)
export async function feature(name) { if (!(await getConfig()).settings[name]) throw problem('This feature is currently unavailable.', 404) }
export async function studentHasDomainAccess(student) {
  const enrollment = await BatchEnrollment.findOne({ student: student._id, status: { $in: ['Enrolled', 'Completed'] } }).sort({ createdAt: -1 }).populate('batch', 'domain enabled status').lean()
  return Boolean(enrollment?.batch?.enabled && enrollment.batch.domain === student.internshipDomain && !['Draft', 'Cancelled'].includes(enrollment.batch.status))
}
export async function taskQuery(student, { batchId, includeClosed = true } = {}) {
  const { settings } = await getConfig()
  if (!await studentHasDomainAccess(student)) return { _id: { $exists: false } }
  const enrolled = settings.batchesEnabled ? await BatchEnrollment.find({ student: student._id, status: { $in: ['Enrolled', 'Completed'] }, ...(batchId ? { batch: batchId } : {}) }).distinct('batch') : []
  const batches = await InternshipBatch.find({ _id: { $in: enrolled }, enabled: true, status: { $nin: ['Draft', 'Cancelled'] } }).distinct('_id')
  return { domain: student.internshipDomain, status: { $in: includeClosed ? ['Published', 'Closed'] : ['Published'] }, assignedDate: { $lte: new Date() }, $or: [{ scope: 'Domain' }, { scope: 'Student', student: student._id }, { scope: 'Batch', batch: { $in: batches } }] }
}
export async function accessibleTask(student, taskId) {
  if (!id(taskId)) throw problem('Task not found.', 404)
  const item = await InternshipTask.findOne({ _id: taskId, ...await taskQuery(student) }).lean()
  if (!item) throw problem('Task not found.', 404)
  return item
}
export function learningError(error, _req, res, _next) {
  const status = error.status || (error.code === 11000 ? 409 : error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500)
  res.status(status).json({ success: false, message: error.status ? error.message : status === 409 ? 'This record already exists or was changed. Refresh and try again.' : status === 400 ? 'Check the supplied fields and try again.' : 'The learning service is temporarily unavailable. Please try again.' })
}
