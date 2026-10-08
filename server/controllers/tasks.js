import { learningStages } from '../services/learning-stages.js'
import { normalizeInternshipDomain } from '../../shared/internship-domain.js'
import { InternshipTask, InternshipBatch, TaskSubmission, LearningFile } from '../models/learning.js'
import { Student } from '../models/student.js'
import { getDomain } from '../models/management.js'
import { taskStatuses, submissionStatuses, submissionMethods } from '../../shared/learning.js'
import { accessibleTask, taskQuery, problem, id } from '../services/learning-access.js'
import { recordActivity } from '../services/learning-activity.js'
import { notifyStudent } from '../services/learning-notifications.js'
import { respond, validateUrl } from '../utils/api.js'

export async function tasks(_req, res) { return respond(res, await InternshipTask.find().sort({ createdAt: -1 }).limit(500).lean()) }
export async function saveTask(req, res) {
  const item = req.params.id ? await InternshipTask.findById(req.params.id) : new InternshipTask()
  if (!item) throw problem('Task not found.', 404)
  const fields = ['stage', 'title', 'description', 'instructions', 'domain', 'scope', 'batch', 'student', 'assignedDate', 'dueDate', 'maximumMarks', 'referenceUrl', 'methods', 'required', 'status']
  const value = { ...item.toObject(), ...Object.fromEntries(fields.filter(key => key in req.body).map(key => [key, req.body[key]])) }
  if (!['title', 'description', 'domain'].every(key => typeof value[key] === 'string' && value[key].trim()) || !['Domain', 'Batch', 'Student'].includes(value.scope) || !taskStatuses.includes(value.status)) throw problem('Complete the task title, description, domain, assignment target and status.')
  value.stage ||= 'Task'
  value.domain = normalizeInternshipDomain(value.domain)
  if (!['Task', 'Project'].includes(value.stage)) throw problem('Choose Task or Project.')
  if (value.stage === 'Project' && (!Array.isArray(value.methods) || !value.methods.includes('file'))) throw problem('Final projects must allow secure file uploads.')
  if (!(await getDomain(value.domain))?.active) throw problem('Choose an active domain.')
  if (!Number.isFinite(Date.parse(value.assignedDate)) || !Number.isFinite(Date.parse(value.dueDate)) || new Date(value.dueDate) < new Date(value.assignedDate)) throw problem('Due date must be on or after the assigned date.')
  if (value.maximumMarks !== undefined && value.maximumMarks !== null && value.maximumMarks !== '' && (!Number.isFinite(value.maximumMarks) || value.maximumMarks < 1 || value.maximumMarks > 10000)) throw problem('Enter valid maximum marks.')
  if (typeof value.required !== 'boolean' || !Array.isArray(value.methods) || !value.methods.length || value.methods.some(method => !submissionMethods.includes(method)) || !validateUrl(value.referenceUrl)) throw problem('Choose submission methods, a valid reference URL and required state.')
  if (value.scope === 'Batch' && (!id(value.batch) || !await InternshipBatch.exists({ _id: value.batch, domain: value.domain, ...(item.isNew || String(item.batch) !== String(value.batch) ? { status: { $in: ['Upcoming', 'Active'] } } : {}) }))) throw problem('Choose an upcoming or active batch in the task domain.')
  if (value.scope === 'Student' && (!id(value.student) || !await Student.exists({ _id: value.student, internshipDomain: value.domain }))) throw problem('Choose a student in the task domain.')
  if (!item.isNew && await TaskSubmission.exists({ task: item._id }) && ['stage', 'domain', 'scope', 'batch', 'student'].some(key => String(value[key] || '') !== String(item[key] || ''))) throw problem('The audience of a task with submissions cannot change.', 409)
  item.set(Object.fromEntries(fields.map(key => [key, value[key]])))
  item.batch = value.scope === 'Batch' ? value.batch : undefined; item.student = value.scope === 'Student' ? value.student : undefined
  item.maximumMarks = value.maximumMarks || undefined
  await item.save(); return respond(res, item)
}
export async function studentTasks(req, res) {
  const items = await InternshipTask.find(await taskQuery(req.student)).sort({ dueDate: 1 }).limit(500).lean()
  const submissions = await TaskSubmission.find({ student: req.student._id, task: { $in: items.map(item => item._id) } }).lean()
  const stages = await learningStages(req.student)
  return respond(res, items.filter(item => stages.videosDone && (item.stage !== 'Project' || stages.tasksDone)).map(item => ({ ...item, submission: submissions.find(row => String(row.task) === String(item._id)) || null })))
}
export async function submitTask(req, res) {
  const task = await accessibleTask(req.student, req.params.id)
  if (task.status !== 'Published') throw problem('This task is closed for submissions.', 409)
  const revision = {}
  for (const key of ['text', 'github', 'demo']) {
    const value = req.body[key]
    if (value !== undefined && typeof value !== 'string') throw problem('Enter a valid response.')
    if (value?.trim()) {
      if (!task.methods.includes(key)) throw problem('This submission method is not enabled.')
      if (value.length > (key === 'text' ? 12000 : 2000)) throw problem('The response is too long.')
      if (key !== 'text' && (!validateUrl(value) || (key === 'github' && new URL(value).hostname !== 'github.com'))) throw problem('Enter a valid project or GitHub URL.')
      revision[key] = value.trim()
    }
  }
  if (req.body.file) {
    if (!task.methods.includes('file') || !id(req.body.file) || !await LearningFile.exists({ _id: req.body.file, task: task._id, student: req.student._id, purpose: 'submission' })) throw problem('Choose an uploaded file belonging to this task.')
    revision.file = req.body.file
  }
  if (task.stage === 'Project' && !revision.file) throw problem('Upload your final project file before submitting.')
  if (!Object.keys(revision).length) throw problem('Provide at least one supported submission method.')
  revision.submittedAt = new Date(); revision.late = revision.submittedAt > task.dueDate
  const existing = await TaskSubmission.findOne({ task: task._id, student: req.student._id }).lean()
  let item
  if (existing) {
    if (existing.status !== 'Resubmit' || existing.revisions.length >= 50) throw problem('Only submissions with Changes Requested may be resubmitted.', 409)
    item = await TaskSubmission.findOneAndUpdate({ _id: existing._id, version: existing.version, status: 'Resubmit' }, { $push: { revisions: revision }, $set: { status: 'Submitted' }, $inc: { version: 1 } }, { returnDocument: 'after', runValidators: true })
    if (!item) throw problem('Submission changed. Refresh before submitting again.', 409)
  } else item = await TaskSubmission.create({ task: task._id, student: req.student._id, revisions: [revision] })
  await recordActivity(req.student._id, 'task-submitted', `submit:${task._id}`, `Submitted: ${task.title}`, 20)
  return respond(res, item, 201)
}
export async function submissions(req, res) {
  const filter = {}
  if (id(req.query.task)) filter.task = req.query.task
  if (submissionStatuses.includes(req.query.status)) filter.status = req.query.status
  return respond(res, await TaskSubmission.find(filter).populate('task', 'title maximumMarks').populate('student', 'studentId fullName').sort({ updatedAt: -1 }).limit(500).lean())
}
export async function reviewSubmission(req, res) {
  if (!submissionStatuses.includes(req.body.status) || req.body.status === 'Submitted' || typeof req.body.feedback !== 'string' || req.body.feedback.length > 4000) throw problem('Choose a review status and valid feedback.')
  if (req.body.status === 'Resubmit' && !req.body.feedback.trim()) throw problem('Explain the requested changes.')
  const item = await TaskSubmission.findById(req.params.id).populate('task').lean()
  if (!item) throw problem('Submission not found.', 404)
  if (req.body.version !== item.version) throw problem('A newer submission exists. Refresh before reviewing.', 409)
  const marks = req.body.marks
  if (marks !== undefined && marks !== null && marks !== '' && (!item.task.maximumMarks || !Number.isFinite(marks) || marks < 0 || marks > item.task.maximumMarks)) throw problem('Marks must be within the task’s maximum marks.')
  const prefix = `revisions.${item.revisions.length - 1}`
  const updated = await TaskSubmission.findOneAndUpdate({ _id: item._id, version: item.version }, { $set: { status: req.body.status, [`${prefix}.feedback`]: req.body.feedback.trim(), [`${prefix}.marks`]: typeof marks === 'number' ? marks : null, [`${prefix}.reviewedAt`]: new Date(), [`${prefix}.reviewStatus`]: req.body.status }, $inc: { version: 1 } }, { returnDocument: 'after' })
  if (!updated) throw problem('Submission changed. Refresh before reviewing.', 409)
  if (['Approved', 'Completed'].includes(req.body.status)) await recordActivity(item.student, 'task-completed', `complete:${item.task._id}`, `Completed: ${item.task.title}`, 40)
  await notifyStudent(item.student, `review:${item._id}:${updated.version}`, req.body.status === 'Resubmit' ? 'Resubmission Requested' : 'Submission Reviewed', `${item.task.title}: ${req.body.status === 'Resubmit' ? 'Changes Requested' : req.body.status}`, '/student/tasks')
  return respond(res, updated)
}
