import { learningStages } from './learning-stages.js'
import { getDomain } from '../models/management.js'
import { BatchEnrollment, InternshipTask, TaskSubmission, VideoProgress, LearningActivity, Certificate } from '../models/learning.js'
import { DiscoverRead } from '../models/discover.js'
import { taskQuery, problem } from './learning-access.js'
import { getConfig } from '../models/management.js'
import { batchProgress } from '../../shared/learning.js'

export async function eligibility(student, enrollment) {
  if (!enrollment || String(enrollment.student) !== String(student._id) || !enrollment.batch) throw problem('Enrollment not found.', 404)
  const batch = enrollment.batch
  const stages = await learningStages(student, enrollment)
  const reasons = []
  if (batch.status !== 'Completed' || enrollment.status !== 'Completed') reasons.push('Batch must be completed with a completed enrollment.')
  if (!stages.videosDone) reasons.push('Complete all required recorded lessons; Admin must configure lessons if none are assigned.')
  if (!stages.tasksDone) reasons.push('All required tasks must be approved; Admin must assign tasks if none are configured.')
  if (!stages.projectsDone) reasons.push('A required final project must be uploaded and approved by Admin.')
  return { ...stages, eligible: !reasons.length, reasons }
}
export async function learningProgress(student) {
  const { settings } = await getConfig()
  const enrollments = settings.batchesEnabled ? await BatchEnrollment.find({ student: student._id }).populate('batch').sort({ createdAt: -1 }).lean() : []
  const current = enrollments.find(item => item.status === 'Enrolled') || enrollments.find(item => item.status === 'Completed')
  const tasks = settings.tasksEnabled ? await InternshipTask.find(await taskQuery(student)).sort({ dueDate: 1 }).lean() : []
  const submissions = await TaskSubmission.find({ student: student._id, task: { $in: tasks.map(item => item._id) } }).lean()
  const completed = submissions.filter(item => ['Approved', 'Completed'].includes(item.status)).length
  const completedIds = new Set(submissions.filter(item => ['Approved', 'Completed'].includes(item.status)).map(item => String(item.task)))
  const stages = await learningStages(student)
  const upcoming = tasks.filter(item => stages.videosDone && (item.stage !== 'Project' || stages.tasksDone) && item.status === 'Published' && !completedIds.has(String(item._id))).slice(0, 5)
  const [videos, discoveries, activity, certificates] = await Promise.all([VideoProgress.countDocuments({ student: student._id, completedAt: { $ne: null } }), DiscoverRead.countDocuments({ student: student._id }), LearningActivity.find({ student: student._id }).sort({ createdAt: -1 }).limit(30).lean(), settings.certificateVerificationEnabled ? Certificate.find({ student: student._id }).select('-student -__v').sort({ issueDate: -1 }).lean() : []])
  if (stages.projectsDone && certificates.some(item => item.status === 'Active' && String(item.enrollment) === String(current?._id))) {
    stages.steps[3].status = 'Completed'
    stages.steps[3].message = 'Admin has issued your certificate.'
  }
  const domain = await getDomain(student.internshipDomain)
  const payment = { fee: domain?.price ?? 499, status: current?.paymentStatus || 'Not Paid', featureEnabled: settings.internshipPaymentsEnabled, gatewayEnabled: false }
  return { stages, payment, enrollment: current || null, history: enrollments, internshipProgress: current?.batch ? batchProgress(current.batch) : null, tasksAssigned: tasks.length, tasksCompleted: completed, tasksPending: tasks.length - completed, videosWatched: videos, discoveriesRead: discoveries, upcoming, activity, certificates, eligibility: current && settings.certificateVerificationEnabled ? await eligibility(student, current) : null }
}
