import { Student } from '../models/student.js'
import { InternshipApplication, Enquiry, ContactMessage } from '../models/index.js'
import { InternshipBatch, InternshipTask, TaskSubmission, Certificate, BatchEnrollment } from '../models/learning.js'
import { TechNews } from '../models/tech-news.js'
import { ContentVideo } from '../models/content-video.js'
import { respond } from '../utils/api.js'
const by = (Model, field) => Model.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }])
const trend = Model => Model.aggregate([{ $match: { createdAt: { $gte: new Date(Date.now() - 180 * 86400000) } } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
export async function analytics(_req, res) {
  const now = new Date()
  const counts = { totalStudents: [Student, {}], activeStudents: [Student, { accountStatus: 'active' }], activeBatches: [InternshipBatch, { status: 'Active', enabled: true }], pendingApplications: [InternshipApplication, { status: { $in: ['New', 'Reviewed', 'Reviewing', 'Shortlisted', 'Interview Scheduled'] } }], tasksAssigned: [InternshipTask, { status: 'Published', assignedDate: { $lte: now } }], pendingReviews: [TaskSubmission, { status: { $in: ['Submitted', 'Under Review'] } }], certificatesIssued: [Certificate, {}], projectEnquiries: [Enquiry, {}], unreadMessages: [ContactMessage, { read: false }], publishedNews: [TechNews, { status: 'published', publishDate: { $lte: now } }], recordedVideos: [ContentVideo, {}] }
  const values = await Promise.all(Object.values(counts).map(([Model, query]) => Model.countDocuments(query)))
  const [registrations, domains, applications, enquiries, completion, batches] = await Promise.all([trend(Student), by(Student, 'internshipDomain'), by(InternshipApplication, 'status'), trend(Enquiry), by(TaskSubmission, 'status'), BatchEnrollment.aggregate([{ $match: { status: { $in: ['Enrolled', 'Completed'] } } }, { $group: { _id: '$batch', count: { $sum: 1 } } }, { $lookup: { from: InternshipBatch.collection.name, localField: '_id', foreignField: '_id', as: 'batch' } }, { $project: { _id: { $arrayElemAt: ['$batch.name', 0] }, count: 1 } }])])
  return respond(res, { counts: Object.fromEntries(Object.keys(counts).map((key, index) => [key, values[index]])), charts: { registrations, domains, applications, enquiries, completion, batches } })
}
export async function catalog(_req, res) {
  const [students, batches, enrollments, videos] = await Promise.all([Student.find().select('studentId fullName internshipDomain leaderboardExcluded').sort({ fullName: 1 }).lean(), InternshipBatch.find().select('name code domain status enabled').sort({ startDate: -1 }).lean(), BatchEnrollment.find({ status: 'Completed' }).populate('student', 'studentId fullName').populate('batch', 'name code').lean(), ContentVideo.find({ status: 'published', duration: { $gt: 0 } }).select('title duration').lean()])
  return respond(res, { students, batches, enrollments, videos })
}
