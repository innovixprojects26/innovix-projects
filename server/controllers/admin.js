import { leadStatuses } from '../../shared/learning.js'
import { updateLead } from './leads.js'
import { Student } from '../models/student.js'
import { InternshipBatch, BatchEnrollment } from '../models/learning.js'
import mongoose from 'mongoose'
import { normalizeInternshipDomain, sameInternshipDomain, isEligibleBatch } from '../../shared/internship-domain.js'
import { getDomain } from '../models/management.js'
import { TechNews } from '../models/tech-news.js'
import { ContentVideo } from '../models/content-video.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin, ContactMessage, CustomProject, Enquiry, InternshipApplication, Project, Testimonial } from '../models/index.js'
import { clean, fail, respond, validateUrl } from '../utils/api.js'

const allowedStatuses = { enquiries: leadStatuses, custom: ['New', 'Reviewing', 'Accepted', 'Contacted', 'Requirements Collected', 'Quoted', 'In Progress', 'Completed', 'Closed'], internships: ['Pending', 'Approved', 'Rejected', 'New', 'Reviewed', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Joined', 'Completed'] }
const models = { enquiries: Enquiry, custom: CustomProject, internships: InternshipApplication }
const projectFields = ['title', 'slug', 'description', 'fullDescription', 'domain', 'technologies', 'level', 'projectType', 'image', 'demoUrl', 'features', 'modules', 'requirements', 'problemStatement', 'objectives', 'price', 'published', 'available', 'visibleWhenUnavailable', 'featured', 'trending', 'popular', 'newProject']
const projectLists = new Set(['technologies', 'features', 'modules', 'requirements', 'objectives'])
const slugify = (value) => typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''

function projectPayload(body) {
  const payload = {}
  for (const field of projectFields) {
    if (!(field in body)) continue
    payload[field] = projectLists.has(field) ? (Array.isArray(body[field]) ? body[field] : String(body[field] || '').split('\n')).map((value) => clean(value, 160)).filter(Boolean) : body[field]
  }
  if ('slug' in payload) payload.slug = slugify(payload.slug)
  for (const field of ['title', 'description', 'fullDescription', 'domain', 'image', 'demoUrl', 'problemStatement']) if (field in payload) payload[field] = clean(payload[field], field === 'description' ? 500 : 2000)
  if ('price' in payload) payload.price = Number(payload.price)
  return payload
}

function projectValidation(payload) {
  for (const key of ['published', 'available', 'visibleWhenUnavailable', 'featured', 'trending', 'popular', 'newProject']) if (key in payload && typeof payload[key] !== 'boolean') return 'Project switches must be true or false'
  if (!payload.title || !payload.slug || !payload.description || !payload.domain || !payload.level || !payload.projectType) return 'Title, slug, description, domain, level, and project type are required'
  if (!validateUrl(payload.image) || !validateUrl(payload.demoUrl)) return 'Image and demo URLs must be valid http(s) URLs'
  if (!Number.isFinite(payload.price) || payload.price < 0) return 'Price must be a non-negative number'
  return null
}

export async function login(req, res) { const { email, password } = req.body; if (!email || !password) return fail(res, 'Email and password are required'); const admin = await Admin.findOne({ email: email.toLowerCase().trim() }); if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return fail(res, 'Invalid admin credentials', 401); const token = jwt.sign({ id: admin._id.toString(), email: admin.email, role: admin.role }, env.jwtSecret, { expiresIn: '8h' }); return respond(res, { token, admin: { email: admin.email, role: admin.role } }) }
export async function dashboard(req, res) {
  const [projects, publishedProjects, enquiries, totalEnquiries, customProjects, internships, unreadMessages, totalMessages, publishedTestimonials, totalTestimonials, recentEnquiries, recentCustom, recentInternships, recentMessages] = await Promise.all([
    Project.countDocuments(), Project.countDocuments({ published: true }), Enquiry.countDocuments({ status: 'New' }), Enquiry.countDocuments(), CustomProject.countDocuments(), InternshipApplication.countDocuments(), ContactMessage.countDocuments({ read: false }), ContactMessage.countDocuments(), Testimonial.countDocuments({ published: true }), Testimonial.countDocuments(),
    Enquiry.find().sort({ createdAt: -1 }).limit(4).select('studentName projectTitle createdAt').lean(),
    CustomProject.find().sort({ createdAt: -1 }).limit(4).select('studentName projectIdea createdAt').lean(),
    InternshipApplication.find().sort({ createdAt: -1 }).limit(4).select('name createdAt').lean(),
    ContactMessage.find().sort({ createdAt: -1 }).limit(4).select('name createdAt').lean(),
  ])
  const [availableProjects, totalStudents, activeStudents, publishedNews, recordedVideos, recentStudents] = await Promise.all([Project.countDocuments({ available: { $ne: false } }), Student.countDocuments(), Student.countDocuments({ accountStatus: 'active' }), TechNews.countDocuments({ status: 'published', publishDate: { $lte: new Date() } }), ContentVideo.countDocuments(), Student.find().sort({ createdAt: -1 }).limit(4).select('fullName createdAt').lean()])
  const recentActivity = [
    ...recentStudents.map(item => ({ id: item._id, type: 'Student registration', label: item.fullName, createdAt: item.createdAt, path: '/admin/students' })),
    ...recentEnquiries.map((item) => ({ id: item._id, type: 'Project enquiry', label: `${item.studentName} · ${item.projectTitle || 'Project'}`, createdAt: item.createdAt, path: '/admin/enquiries' })),
    ...recentCustom.map((item) => ({ id: item._id, type: 'Custom request', label: `${item.studentName} · ${item.projectIdea}`, createdAt: item.createdAt, path: '/admin/custom-projects' })),
    ...recentInternships.map((item) => ({ id: item._id, type: 'Internship application', label: item.name, createdAt: item.createdAt, path: '/admin/internships' })),
    ...recentMessages.map((item) => ({ id: item._id, type: 'Contact message', label: item.name, createdAt: item.createdAt, path: '/admin/messages' })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
  return respond(res, { availableProjects, unavailableProjects: projects - availableProjects, totalStudents, activeStudents, publishedNews, recordedVideos, projects, publishedProjects, enquiries, totalEnquiries, customProjects, internships, unreadMessages, totalMessages, publishedTestimonials, totalTestimonials, recentActivity })
}
export async function adminProjects(req, res) { return respond(res, await Project.find().sort({ createdAt: -1 }).lean()) }
export async function createProject(req, res) {
  const payload = projectPayload(req.body)
  const validation = projectValidation({ price: 2999, ...payload })
  if (validation) return fail(res, validation)
  if (await Project.exists({ slug: payload.slug })) return fail(res, 'Project slug already exists', 409)
  try { return respond(res, await Project.create({ ...payload, published: payload.published === true }), 201) }
  catch (error) { if (error.code === 11000) return fail(res, 'Project slug already exists', 409); throw error }
}
export async function updateProject(req, res) {
  const current = await Project.findById(req.params.id).lean()
  if (!current) return fail(res, 'Project not found', 404)
  const payload = projectPayload(req.body)
  const validation = projectValidation({ ...current, ...payload })
  if (validation) return fail(res, validation)
  if (payload.slug && await Project.exists({ slug: payload.slug, _id: { $ne: current._id } })) return fail(res, 'Project slug already exists', 409)
  try { return respond(res, await Project.findByIdAndUpdate(req.params.id, { $set: payload }, { returnDocument: 'after', runValidators: true })) }
  catch (error) { if (error.code === 11000) return fail(res, 'Project slug already exists', 409); throw error }
}
export async function deleteProject(req, res) { const item = await Project.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Project not found', 404) }
export async function listCollection(req, res) { const Model = models[req.params.collection]; if (!Model) return fail(res, 'Unknown collection', 404); const query = req.query.status ? { status: req.query.status } : {}; const records = Model.find(query).sort({ createdAt: -1 }); if (req.params.collection === 'enquiries') records.populate('project', 'price'); return respond(res, await records.lean()) }
export async function updateStatus(req, res) { const Model = models[req.params.collection]; const valid = allowedStatuses[req.params.collection]; if (!Model || !valid?.includes(req.body.status)) return fail(res, 'Invalid collection or status'); if (req.params.collection === 'enquiries') return updateLead(req, res); if (req.params.collection === 'internships' && ['Approved', 'Rejected'].includes(req.body.status)) return fail(res, 'Use the internship decision action so access is handled safely.'); const item = await Model.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after', runValidators: true }); return item ? respond(res, item) : fail(res, 'Record not found', 404) }
export async function listMessages(req, res) { return respond(res, await ContactMessage.find().sort({ read: 1, createdAt: -1 }).lean()) }
export async function updateMessageRead(req, res) { const item = await ContactMessage.findByIdAndUpdate(req.params.id, { read: Boolean(req.body.read) }, { returnDocument: 'after' }); return item ? respond(res, item) : fail(res, 'Message not found', 404) }
export async function deleteMessage(req, res) { const item = await ContactMessage.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Message not found', 404) }
export async function listAdminTestimonials(req, res) { return respond(res, await Testimonial.find().sort({ createdAt: -1 }).lean()) }
export async function decideInternshipApplication(req, res) {
  const { decision, batchId } = req.body || {}
  if (!['Approved', 'Rejected'].includes(decision)) return fail(res, 'Choose Approve or Reject.')
  const application = await InternshipApplication.findById(req.params.id)
  if (!application) return fail(res, 'Internship application not found.', 404)
  if (decision === 'Rejected') {
    let rejected
    try {
      await mongoose.connection.transaction(async session => {
        const current = await InternshipApplication.findById(application._id).session(session)
        if (!current || ['Approved', 'Joined', 'Rejected'].includes(current.status)) throw Object.assign(new Error('This application can no longer be rejected.'), { status: 409 })
        if (await BatchEnrollment.exists({ application: current._id, status: { $in: ['Enrolled', 'Completed'] } }).session(session)) throw Object.assign(new Error('An enrolled application cannot be rejected.'), { status: 409 })
        current.status = 'Rejected'
        await current.save({ session })
        rejected = current
      })
    } catch (error) {
      if (error.status) return fail(res, error.message, error.status)
      throw error
    }
    return respond(res, { application: rejected, accessGranted: false })
  }
  if (!mongoose.isObjectIdOrHexString(batchId)) return fail(res, 'Choose an eligible batch for this internship.')
  const requestedDomain = await getDomain(application.domain)
  if (!requestedDomain?.active) return fail(res, 'The requested internship domain is not currently available.', 409)
  let enrollment
  let linkedStudent
  try {
    await mongoose.connection.transaction(async session => {
      const current = await InternshipApplication.findById(application._id).session(session)
      if (!current) throw Object.assign(new Error('Internship application not found.'), { status: 404 })
      linkedStudent = await Student.findOne({ email: current.email.trim().toLowerCase(), accountStatus: 'active' }).session(session)
      if (!linkedStudent) throw Object.assign(new Error('No active Student account matches this applicant email. Ask the applicant to register with this email before approving.'), { status: 409 })
      if (!sameInternshipDomain(linkedStudent.internshipDomain, requestedDomain.name)) {
        if (await BatchEnrollment.exists({ student: linkedStudent._id, status: 'Enrolled' }).session(session)) throw Object.assign(new Error('The Student already has an active enrollment in a different internship domain.'), { status: 409 })
        linkedStudent.internshipDomain = normalizeInternshipDomain(requestedDomain.name)
        await linkedStudent.save({ session })
      }
      const existing = await BatchEnrollment.findOne({ application: current._id, status: { $in: ['Enrolled', 'Completed'] } }).session(session)
      if (existing) {
        if (current.status !== 'Approved' && current.status !== 'Joined') throw Object.assign(new Error('This application already has an enrollment and cannot be changed.'), { status: 409 })
        enrollment = existing
        current.status = 'Approved'
        await current.save({ session })
        return
      }
      if (!['Pending', 'New', 'Reviewed', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected'].includes(current.status)) throw Object.assign(new Error('This application is no longer pending approval.'), { status: 409 })
      const batch = await InternshipBatch.findById(batchId).session(session)
      if (!batch || !isEligibleBatch(current, batch)) throw Object.assign(new Error('Choose an enabled Upcoming or Active batch with space for the requested internship domain.'), { status: 409 })
      const reserved = await InternshipBatch.updateOne({ _id: batch._id, $expr: { $lt: ['$enrollmentCount', '$maxStudents'] } }, { $inc: { enrollmentCount: 1 } }, { session })
      if (!reserved.modifiedCount) throw Object.assign(new Error('The selected batch is full.'), { status: 409 })
      const existingEnrollment = await BatchEnrollment.findOne({ student: linkedStudent._id, status: 'Enrolled' }).session(session)
      if (existingEnrollment) throw Object.assign(new Error('This Student already has an active internship enrollment.'), { status: 409 })
      ;[enrollment] = await BatchEnrollment.create([{ student: linkedStudent._id, batch: batch._id, application: current._id }], { session })
      current.status = 'Approved'
      await current.save({ session })
    })
  } catch (error) {
    if (error.status) return fail(res, error.message, error.status)
    throw error
  }
  return respond(res, { application: await InternshipApplication.findById(application._id).lean(), enrollment, accessGranted: true })
}
export async function createTestimonial(req, res) { if (!req.body.studentName || !req.body.review) return fail(res, 'Student name and review are required'); if (!validateUrl(req.body.avatarUrl)) return fail(res, 'Avatar URL must be valid'); const payload = { studentName: clean(req.body.studentName, 120), course: clean(req.body.course, 120), college: clean(req.body.college, 160), project: clean(req.body.project, 160), review: clean(req.body.review, 2000), avatarUrl: clean(req.body.avatarUrl, 2000), published: req.body.published === true }; return respond(res, await Testimonial.create(payload), 201) }
export async function updateTestimonial(req, res) { const payload = Object.fromEntries(['studentName', 'course', 'college', 'project', 'review', 'avatarUrl', 'published'].filter((key) => key in req.body).map((key) => [key, key === 'published' ? req.body[key] === true : clean(req.body[key], 2000)])); if ('avatarUrl' in payload && !validateUrl(payload.avatarUrl)) return fail(res, 'Avatar URL must be valid'); const item = await Testimonial.findByIdAndUpdate(req.params.id, { $set: payload }, { returnDocument: 'after', runValidators: true }); return item ? respond(res, item) : fail(res, 'Testimonial not found', 404) }
export async function deleteTestimonial(req, res) { const item = await Testimonial.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Testimonial not found', 404) }
