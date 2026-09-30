import { StudentNotification, BatchEnrollment, InternshipTask, TaskSubmission, Certificate } from '../models/learning.js'
import { Student } from '../models/student.js'
import { InternshipApplication } from '../models/index.js'
import { Announcement, getConfig, getDomain } from '../models/management.js'
import { ContentVideo } from '../models/content-video.js'
import { DiscoverItem, DiscoverCategory } from '../models/discover.js'
import { taskQuery, problem, id } from '../services/learning-access.js'
import { respond } from '../utils/api.js'
import { randomUUID } from 'node:crypto'

export async function syncNotifications(student) {
  const { settings } = await getConfig(), now = new Date()
  const rows = [], recent = new Date(Date.now() - 30 * 86400000)
  const add = (key, title, message, href = '/student') => rows.push({ student: student._id, key, title, message, href })
  const approved = await InternshipApplication.find({ email: student.email, status: { $in: ['Selected', 'Joined'] }, updatedAt: { $gte: recent } }).limit(10).lean()
  for (const item of approved) add(`application:${item._id}`, 'Internship Approved', `Your ${item.domain} application has been selected.`)
  if (settings.batchesEnabled) for (const item of await BatchEnrollment.find({ student: student._id, status: { $in: ['Enrolled', 'Completed'] } }).populate('batch').limit(20).lean()) if (item.batch) add(`batch:${item._id}`, 'Batch Assigned', `You have been assigned to ${item.batch.name}.`, '/student/internship')
  if (settings.tasksEnabled) {
    const tasks = await InternshipTask.find(await taskQuery(student)).limit(500).lean()
    const submissions = await TaskSubmission.find({ student: student._id, task: { $in: tasks.map(item => item._id) } }).lean()
    for (const item of tasks) {
      add(`task:${item._id}`, 'New Task', item.title, '/student/tasks')
      const submission = submissions.find(row => String(row.task) === String(item._id))
      if ((!submission || submission.status === 'Resubmit') && item.status === 'Published' && item.dueDate > now && item.dueDate - now <= 2 * 86400000) add(`deadline:${item._id}:${item.dueDate.toISOString()}`, 'Task Deadline', `${item.title} is due soon.`, '/student/tasks')
      const review = submission?.revisions.at(-1)
      if (review?.reviewedAt) add(`review:${submission._id}:${submission.version}`, submission.status === 'Resubmit' ? 'Resubmission Requested' : 'Submission Reviewed', `${item.title}: ${submission.status === 'Resubmit' ? 'Changes Requested' : submission.status}`, '/student/tasks')
    }
  }
  if (settings.certificateVerificationEnabled) for (const item of await Certificate.find({ student: student._id }).limit(50).lean()) add(`certificate:${item._id}:${item.status}`, item.status === 'Active' ? 'Certificate Issued' : 'Certificate Revoked', `${item.type}: ${item.certificateId}`, '/student/certificates')
  const announcements = await Announcement.find({ active: true, $and: [{ $or: [{ startDate: null }, { startDate: { $lte: now } }] }, { $or: [{ endDate: null }, { endDate: { $gte: now } }] }] }).limit(30).lean()
  for (const item of announcements) add(`announcement:${item._id}:${item.updatedAt.toISOString()}`, 'Important Announcement', `${item.title}: ${item.message}`.slice(0, 1000))
  const track = await getDomain(student.internshipDomain)
  if (track?.active && track.liveClassEnabled && track.classActive && track.meetingUrl && track.updatedAt >= recent) add(`live:${track._id}:${track.updatedAt.toISOString()}`, 'Live Class Update', `${track.classTitle || 'Live Class'}: ${track.date || 'See your dashboard for details'}.`, '/student/internship')
  if (student.internshipDomain === 'Content Creation' && track?.active && track.recordedClassesEnabled) for (const item of await ContentVideo.find({ status: 'published', publishDate: { $lte: now, $gte: recent }, videoFile: { $exists: true } }).select('title').limit(30).lean()) add(`video:${item._id}`, 'New Recorded Class', item.title, '/student/recorded-classes')
  if (settings.newsEnabled && settings.discoverEnabled) {
    const categories = await DiscoverCategory.find({ active: true }).distinct('name')
    for (const item of await DiscoverItem.find({ status: 'published', deletedAt: null, domains: { $in: [student.internshipDomain, 'General'] }, category: { $in: categories }, publishedAt: { $lte: now, $gte: recent } }).sort({ publishedAt: -1 }).limit(5).lean()) add(`discover:${item._id}`, 'Relevant Learning Update', item.title, '/news')
  }
  if (rows.length) await StudentNotification.bulkWrite(rows.map(row => ({ updateOne: { filter: { student: row.student, key: row.key }, update: { $setOnInsert: row }, upsert: true } })))
}
export async function notifications(req, res) {
  await syncNotifications(req.student)
  const query = { student: req.student._id, ...(req.query.unread === 'true' ? { readAt: null } : {}) }
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(req.query.page)) || 1))
  const [items, unreadCount, total] = await Promise.all([StudentNotification.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 30).limit(30).select('-student -key').lean(), StudentNotification.countDocuments({ student: req.student._id, readAt: null }), StudentNotification.countDocuments(query)])
  return respond(res, { items, unreadCount, page, hasMore: page * 30 < total })
}
export async function readNotification(req, res) {
  const query = { student: req.student._id, ...(req.params.id ? { _id: req.params.id } : {}) }
  if (req.params.id && !await StudentNotification.exists(query)) throw problem('Notification not found.', 404)
  await StudentNotification.updateMany({ ...query, readAt: null }, { $set: { readAt: new Date() } })
  return respond(res, { read: true })
}
export async function adminNotifications(_req, res) {
  return respond(res, await StudentNotification.find({ key: /^manual:/ }).populate('student', 'studentId fullName').sort({ createdAt: -1 }).limit(100).lean())
}
export async function sendNotification(req, res) {
  const { title, message, student, domain, href = '/student' } = req.body
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || typeof message !== 'string' || !message.trim() || message.length > 1000 || typeof href !== 'string' || !/^\/(student(?:\/(tasks|certificates|internship|recorded-classes))?|news|tech-news)$/.test(href)) throw problem('Enter a title, message and supported internal link.')
  if (!student && !domain) throw problem('Choose a student or domain audience.')
  if (student && !id(student)) throw problem('Invalid student.')
  if (domain && typeof domain !== 'string') throw problem('Invalid domain.')
  const recipients = await Student.find({ accountStatus: 'active', ...(student ? { _id: student } : { internshipDomain: domain }) }).select('_id').lean()
  if (!recipients.length) throw problem('No matching active students.')
  const key = `manual:${randomUUID()}`
  await StudentNotification.insertMany(recipients.map(item => ({ student: item._id, key, title: title.trim(), message: message.trim(), href })))
  return respond(res, { recipients: recipients.length }, 201)
}
