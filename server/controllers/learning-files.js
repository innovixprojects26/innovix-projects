import { rm } from 'node:fs/promises'
import { LearningFile, InternshipTask, TaskSubmission } from '../models/learning.js'
import { accessibleTask, problem } from '../services/learning-access.js'
import { receiveLearningFile, learningFilePath } from '../storage/learning-files.js'
import { respond } from '../utils/api.js'

export async function uploadFile(req, res) {
  const task = req.student ? await accessibleTask(req.student, req.params.id) : await InternshipTask.findById(req.params.id)
  if (!task) throw problem('Task not found.', 404)
  if (req.student && (task.status !== 'Published' || !task.methods.includes('file'))) throw problem('File submissions are not enabled for this task.', 403)
  if (req.student && await TaskSubmission.exists({ student: req.student._id, task: task._id, status: { $ne: 'Resubmit' } })) throw problem('An updated file may be uploaded only when changes are requested.', 409)
  const media = await receiveLearningFile(req)
  try {
    const file = await LearningFile.create({ ...media, task: task._id, ...(req.student ? { student: req.student._id, purpose: 'submission' } : { purpose: 'attachment' }) })
    if (!req.student) await InternshipTask.updateOne({ _id: task._id }, { $set: { attachment: file._id } })
    return respond(res, { _id: file._id, originalName: file.originalName, type: file.type, bytes: file.bytes }, 201)
  } catch (error) { await rm(learningFilePath(media.filename), { force: true }); throw error }
}
export async function downloadFile(req, res) {
  const file = await LearningFile.findById(req.params.id).select('+filename').lean()
  if (!file) throw problem('File not found.', 404)
  if (req.student) {
    await accessibleTask(req.student, file.task)
    if (file.purpose === 'submission' && String(file.student) !== String(req.student._id)) throw problem('File not found.', 404)
  }
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" })
  res.download(learningFilePath(file.filename), file.originalName, error => { if (error && !res.headersSent) res.status(404).json({ success: false, message: 'File unavailable.' }) })
}
