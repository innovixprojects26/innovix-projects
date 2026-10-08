import { BatchEnrollment, InternshipTask, TaskSubmission, VideoProgress } from '../models/learning.js'
import { ContentVideo } from '../models/content-video.js'
import { normalizeInternshipDomain, sameInternshipDomain } from '../../shared/internship-domain.js'
import { taskQuery, studentHasDomainAccess, problem } from './learning-access.js'

// Shared by the dashboard, submissions, file access and certificate issuance.
// Empty curricula fail closed until Admin configures the required work.
export async function learningStages(student, enrollment) {
  const current = enrollment || await BatchEnrollment.findOne({ student: student._id, status: { $in: ['Enrolled', 'Completed'] } }).sort({ createdAt: -1 }).populate('batch').lean()
  const domain = normalizeInternshipDomain(current?.batch?.domain || student.internshipDomain)
  const access = enrollment ? ['Enrolled', 'Completed'].includes(enrollment.status) : await studentHasDomainAccess(student)
  let query = await taskQuery({ ...(student.toObject?.() || student), internshipDomain: domain })
  if (enrollment) {
    const batch = enrollment.batch
    const names = (await InternshipTask.distinct('domain')).filter(name => sameInternshipDomain(name, domain))
    query = { domain: { $in: names }, status: { $in: ['Published', 'Closed'] }, assignedDate: { $lte: batch.endDate }, $or: [{ scope: 'Batch', batch: batch._id }, { scope: 'Domain', assignedDate: { $gte: batch.startDate } }, { scope: 'Student', student: student._id, assignedDate: { $gte: batch.startDate } }] }
  }
  const items = await InternshipTask.find(query).lean()
  const videos = (await ContentVideo.find({ required: { $ne: false }, status: 'published', publishDate: { $lte: new Date() }, $or: [{ videoFile: { $exists: true, $ne: null } }, { videoUrl: { $exists: true, $ne: '' } }] }).select('_id domain').lean()).filter(item => sameInternshipDomain(item.domain || 'Content Creation', domain))
  const videoIds = [...new Set([...videos.map(item => String(item._id)), ...(current?.batch?.requiredVideos || []).map(String)])]
  const completedVideos = await VideoProgress.countDocuments({ student: student._id, video: { $in: videoIds }, completedAt: { $ne: null } })
  const requiredTasks = items.filter(item => item.required && item.stage !== 'Project')
  const requiredProjects = items.filter(item => item.required && item.stage === 'Project')
  const submissions = await TaskSubmission.find({ student: student._id, task: { $in: items.map(item => item._id) }, status: { $in: ['Approved', 'Completed'] } }).lean()
  const approved = new Set(submissions.map(item => String(item.task)))
  const projectApproved = new Set(submissions.filter(item => item.revisions?.at(-1)?.file).map(item => String(item.task)))
  const completedTasks = requiredTasks.filter(item => approved.has(String(item._id))).length
  const completedProjects = requiredProjects.filter(item => projectApproved.has(String(item._id))).length
  const videosDone = access && videoIds.length > 0 && completedVideos === videoIds.length
  const tasksDone = videosDone && requiredTasks.length > 0 && completedTasks === requiredTasks.length
  const projectsDone = tasksDone && requiredProjects.length > 0 && completedProjects === requiredProjects.length
  const status = (unlocked, completed) => completed ? 'Completed' : unlocked ? 'In Progress' : 'Locked'
  return { videosDone, tasksDone, projectsDone, requiredVideos: videoIds.length, completedVideos, requiredTasks: requiredTasks.length, completedTasks, requiredProjects: requiredProjects.length, completedProjects,
    steps: [
      { name: 'Videos', status: status(access, videosDone), completed: completedVideos, total: videoIds.length, message: !videoIds.length ? 'Admin must configure required recorded lessons.' : 'Watch all required lessons to unlock tasks.', href: '/student/recorded-classes' },
      { name: 'Tasks', status: status(videosDone, tasksDone), completed: completedTasks, total: requiredTasks.length, message: !videosDone ? 'Complete required videos first.' : !requiredTasks.length ? 'Admin must assign required tasks.' : 'Submit required tasks and wait for Admin approval.', href: '/student/tasks' },
      { name: 'Projects', status: status(tasksDone, projectsDone), completed: completedProjects, total: requiredProjects.length, message: !tasksDone ? 'All required tasks need approval first.' : !requiredProjects.length ? 'Admin must assign a required final project.' : 'Upload your final project and wait for Admin approval.', href: '/student/tasks?stage=Project' },
      { name: 'Certificate', status: status(projectsDone, false), message: projectsDone ? 'Learning requirements complete. Admin must complete your batch and issue the certificate.' : 'Complete videos, approved tasks and approved final project uploads.', href: '/student/certificates' },
    ] }
}

export async function requireLearningStage(student, task) {
  const stages = await learningStages(student)
  if (!stages.videosDone) throw problem('Complete all required recorded lessons before accessing tasks.', 403)
  if (task.stage === 'Project' && !stages.tasksDone) throw problem('All required tasks must be approved before accessing final projects.', 403)
}

export async function videoSequence(student, domain) {
  const domainQuery = domain === 'Content Creation' ? { $or: [{ domain }, { domain: { $exists: false } }] } : { domain }
  const videos = await ContentVideo.find({ $and: [domainQuery, { status: 'published', publishDate: { $lte: new Date() } }, { $or: [{ videoFile: { $exists: true, $ne: null } }, { videoUrl: { $exists: true, $ne: '' } }] }] }).sort({ position: 1, _id: 1 }).select('_id').lean()
  const progress = await VideoProgress.find({ student: student._id, video: { $in: videos.map(item => item._id) }, completedAt: { $ne: null } }).select('video').lean()
  const completed = new Set(progress.map(item => String(item.video)))
  let blocked = false
  return new Map(videos.map(item => {
    const isComplete = completed.has(String(item._id))
    const state = { completed: isComplete, locked: !isComplete && blocked }
    if (!isComplete) blocked = true
    return [String(item._id), state]
  }))
}
