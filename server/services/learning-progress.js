import { BatchEnrollment, InternshipTask, TaskSubmission, VideoProgress, LearningActivity, Certificate } from '../models/learning.js'
import { DiscoverRead } from '../models/discover.js'
import { taskQuery, problem } from './learning-access.js'
import { getConfig } from '../models/management.js'
import { batchProgress } from '../../shared/learning.js'

export async function eligibility(student, enrollment) {
  if (!enrollment || String(enrollment.student) !== String(student._id) || !enrollment.batch) throw problem('Enrollment not found.', 404)
  const batch = enrollment.batch
  // Issuance requirements are historical facts, unaffected by visibility switches.
  const required = await InternshipTask.find({ domain: batch.domain, status: { $in: ['Published', 'Closed'] }, required: true, assignedDate: { $lte: batch.endDate }, $or: [{ scope: 'Batch', batch: batch._id }, { scope: 'Domain', assignedDate: { $gte: batch.startDate } }, { scope: 'Student', student: student._id, assignedDate: { $gte: batch.startDate } }] }).select('_id').lean()
  const completed = await TaskSubmission.countDocuments({ student: student._id, task: { $in: required.map(item => item._id) }, status: { $in: ['Approved', 'Completed'] } })
  const videos = await VideoProgress.countDocuments({ student: student._id, video: { $in: batch.requiredVideos || [] }, completedAt: { $ne: null } })
  const reasons = []
  if (batch.status !== 'Completed' || enrollment.status !== 'Completed') reasons.push('Batch must be completed with a completed enrollment.')
  if (completed < required.length) reasons.push(`${required.length - completed} required task(s) remain.`)
  if (videos < (batch.requiredVideos || []).length) reasons.push('Required recorded classes remain.')
  return { eligible: !reasons.length, reasons, requiredTasks: required.length, completedTasks: completed, requiredVideos: (batch.requiredVideos || []).length, completedVideos: videos }
}
export async function learningProgress(student) {
  const { settings } = await getConfig()
  const enrollments = settings.batchesEnabled ? await BatchEnrollment.find({ student: student._id }).populate('batch').sort({ createdAt: -1 }).lean() : []
  const current = enrollments.find(item => item.status === 'Enrolled') || enrollments.find(item => item.status === 'Completed')
  const tasks = settings.tasksEnabled ? await InternshipTask.find(await taskQuery(student)).sort({ dueDate: 1 }).lean() : []
  const submissions = await TaskSubmission.find({ student: student._id, task: { $in: tasks.map(item => item._id) } }).lean()
  const completed = submissions.filter(item => ['Approved', 'Completed'].includes(item.status)).length
  const completedIds = new Set(submissions.filter(item => ['Approved', 'Completed'].includes(item.status)).map(item => String(item.task)))
  const upcoming = tasks.filter(item => item.status === 'Published' && !completedIds.has(String(item._id))).slice(0, 5)
  const [videos, discoveries, activity, certificates] = await Promise.all([VideoProgress.countDocuments({ student: student._id, completedAt: { $ne: null } }), DiscoverRead.countDocuments({ student: student._id }), LearningActivity.find({ student: student._id }).sort({ createdAt: -1 }).limit(30).lean(), settings.certificateVerificationEnabled ? Certificate.find({ student: student._id }).select('-student -__v').sort({ issueDate: -1 }).lean() : []])
  return { enrollment: current || null, history: enrollments, internshipProgress: current?.batch ? batchProgress(current.batch) : null, tasksAssigned: tasks.length, tasksCompleted: completed, tasksPending: tasks.length - completed, videosWatched: videos, discoveriesRead: discoveries, upcoming, activity, certificates, eligibility: current && settings.certificateVerificationEnabled ? await eligibility(student, current) : null }
}
