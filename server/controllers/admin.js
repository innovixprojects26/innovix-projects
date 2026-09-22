import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin, ContactMessage, CustomProject, Enquiry, InternshipApplication, Project, Testimonial } from '../models/index.js'
import { clean, fail, respond, validateUrl } from '../utils/api.js'

const allowedStatuses = { enquiries: ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Closed'], custom: ['New', 'Contacted', 'Requirements Collected', 'Quoted', 'In Progress', 'Completed', 'Closed'], internships: ['New', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Joined', 'Completed'] }
const models = { enquiries: Enquiry, custom: CustomProject, internships: InternshipApplication }
const projectFields = ['title', 'slug', 'description', 'fullDescription', 'domain', 'technologies', 'level', 'projectType', 'image', 'demoUrl', 'features', 'modules', 'requirements', 'problemStatement', 'objectives', 'price', 'published', 'trending', 'popular', 'newProject']
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
  const recentActivity = [
    ...recentEnquiries.map((item) => ({ id: item._id, type: 'Project enquiry', label: `${item.studentName} · ${item.projectTitle || 'Project'}`, createdAt: item.createdAt, path: '/admin/enquiries' })),
    ...recentCustom.map((item) => ({ id: item._id, type: 'Custom request', label: `${item.studentName} · ${item.projectIdea}`, createdAt: item.createdAt, path: '/admin/custom-projects' })),
    ...recentInternships.map((item) => ({ id: item._id, type: 'Internship application', label: item.name, createdAt: item.createdAt, path: '/admin/internships' })),
    ...recentMessages.map((item) => ({ id: item._id, type: 'Contact message', label: item.name, createdAt: item.createdAt, path: '/admin/messages' })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
  return respond(res, { projects, publishedProjects, enquiries, totalEnquiries, customProjects, internships, unreadMessages, totalMessages, publishedTestimonials, totalTestimonials, recentActivity })
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
  try { return respond(res, await Project.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true, runValidators: true })) }
  catch (error) { if (error.code === 11000) return fail(res, 'Project slug already exists', 409); throw error }
}
export async function deleteProject(req, res) { const item = await Project.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Project not found', 404) }
export async function listCollection(req, res) { const Model = models[req.params.collection]; if (!Model) return fail(res, 'Unknown collection', 404); const query = req.query.status ? { status: req.query.status } : {}; const records = Model.find(query).sort({ createdAt: -1 }); if (req.params.collection === 'enquiries') records.populate('project', 'price'); return respond(res, await records.lean()) }
export async function updateStatus(req, res) { const Model = models[req.params.collection]; const valid = allowedStatuses[req.params.collection]; if (!Model || !valid?.includes(req.body.status)) return fail(res, 'Invalid collection or status'); const item = await Model.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true }); return item ? respond(res, item) : fail(res, 'Record not found', 404) }
export async function listMessages(req, res) { return respond(res, await ContactMessage.find().sort({ read: 1, createdAt: -1 }).lean()) }
export async function updateMessageRead(req, res) { const item = await ContactMessage.findByIdAndUpdate(req.params.id, { read: Boolean(req.body.read) }, { new: true }); return item ? respond(res, item) : fail(res, 'Message not found', 404) }
export async function deleteMessage(req, res) { const item = await ContactMessage.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Message not found', 404) }
export async function listAdminTestimonials(req, res) { return respond(res, await Testimonial.find().sort({ createdAt: -1 }).lean()) }
export async function createTestimonial(req, res) { if (!req.body.studentName || !req.body.review) return fail(res, 'Student name and review are required'); if (!validateUrl(req.body.avatarUrl)) return fail(res, 'Avatar URL must be valid'); const payload = { studentName: clean(req.body.studentName, 120), course: clean(req.body.course, 120), college: clean(req.body.college, 160), project: clean(req.body.project, 160), review: clean(req.body.review, 2000), avatarUrl: clean(req.body.avatarUrl, 2000), published: req.body.published === true }; return respond(res, await Testimonial.create(payload), 201) }
export async function updateTestimonial(req, res) { const payload = Object.fromEntries(['studentName', 'course', 'college', 'project', 'review', 'avatarUrl', 'published'].filter((key) => key in req.body).map((key) => [key, key === 'published' ? req.body[key] === true : clean(req.body[key], 2000)])); if ('avatarUrl' in payload && !validateUrl(payload.avatarUrl)) return fail(res, 'Avatar URL must be valid'); const item = await Testimonial.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true, runValidators: true }); return item ? respond(res, item) : fail(res, 'Testimonial not found', 404) }
export async function deleteTestimonial(req, res) { const item = await Testimonial.findByIdAndDelete(req.params.id); return item ? respond(res, { deleted: true }) : fail(res, 'Testimonial not found', 404) }
