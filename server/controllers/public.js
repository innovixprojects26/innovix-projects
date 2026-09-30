import { getConfig, getDomain } from '../models/management.js'
import { ContactMessage, CustomProject, Enquiry, InternshipApplication, Project, Testimonial } from '../models/index.js'
import mongoose from 'mongoose'
import { clean, fail, respond, validateEmail, validateUrl } from '../utils/api.js'
import { normalizePhone } from '../../shared/phone.js'

function requestPhone(req, res, required = false) {
  try { return normalizePhone(req.body.phoneCountry, req.body.phone, required) }
  catch (error) { fail(res, error.message); return null }
}

const projectView = (project) => project.toObject()

export async function listProjects(req, res) {
  if (!(await getConfig()).settings.projectsEnabled) return req.params.slug ? fail(res, 'Projects are currently unavailable. Please check back soon.', 403) : respond(res, [])
  const visible = { published: true, $or: [{ available: { $ne: false } }, { visibleWhenUnavailable: { $ne: false } }] }
  if (req.params.slug) { const item = await Project.findOne({ ...visible, slug: req.params.slug }).lean(); return item ? respond(res, item) : fail(res, 'Project not found', 404) }
  const items = await Project.find(visible).sort({ featured: -1, popular: -1, trending: -1, createdAt: -1 }).lean()
  return respond(res, items)
}
export async function listTestimonials(req, res) { if (!(await getConfig()).settings.testimonialsEnabled) return respond(res, []); return respond(res, await Testimonial.find({ published: true }).sort({ createdAt: -1 }).lean()) }
export async function createEnquiry(req, res) {
  const { settings } = await getConfig()
  if (!settings.projectsEnabled || !settings.projectEnquiriesEnabled) return fail(res, 'Project enquiries are currently unavailable.', 403)
  const { studentName, email, degreeCourse, college, project, message } = req.body
  if (!studentName || !validateEmail(email)) return fail(res, 'Student name and a valid email are required')
  const phone = requestPhone(req, res, true)
  if (!phone) return
  if (!mongoose.isValidObjectId(project)) return fail(res, 'A valid project is required')
  const selected = await Project.findOne({ _id: project, published: true }).lean()
  if (!selected) return fail(res, 'Project not found', 404)
  if (selected.available === false) return fail(res, 'This project is currently unavailable.', 403)
  return respond(res, await Enquiry.create({ studentName: clean(studentName, 120), email: email.trim(), ...phone, degreeCourse: clean(degreeCourse, 160), college: clean(college, 180), project: selected._id, projectTitle: selected.title, projectPrice: selected.price ?? 2999, message: clean(message) }), 201)
}
export async function createCustomProject(req, res) {
  if (!(await getConfig()).settings.customRequestsEnabled) return fail(res, 'Custom project requests are currently closed.', 403)
  const { studentName, email, degreeCourse, college, domain, preferredTechnology, projectIdea, description, deadline, budget } = req.body
  if (![studentName, degreeCourse, college, domain, preferredTechnology, projectIdea, description, deadline].every((value) => typeof value === 'string' && value.trim()) || !validateEmail(email)) return fail(res, 'Complete all required custom project fields with a valid email.')
  const phone = requestPhone(req, res, true)
  if (!phone) return
  const expectedDate = new Date(deadline)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(expectedDate.getTime()) || expectedDate.toISOString().slice(0, 10) !== deadline) return fail(res, 'Enter a valid expected completion date.')
  const parsedBudget = budget === '' || budget == null ? undefined : Number(budget)
  if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) return fail(res, 'Budget must be a non-negative amount.')
  return respond(res, await CustomProject.create({ studentName: clean(studentName, 120), email: email.trim(), ...phone, degreeCourse: clean(degreeCourse, 160), college: clean(college, 180), domain: clean(domain, 160), preferredTechnology: clean(preferredTechnology, 160), projectIdea: clean(projectIdea, 500), description: clean(description, 4000), deadline: expectedDate, budget: parsedBudget }), 201)
}
export async function createInternship(req, res) {
  const track = await getDomain(req.body.domain)
  const { settings } = await getConfig()
  if (!settings.internshipsEnabled || !settings.internshipApplicationsEnabled || !track?.active || !track.applicationsOpen) return fail(res, 'Applications are currently closed for this internship.', 403)
  const { name, email, degreeCourse, department, college, studyYear, domain, skills, experienceLevel, portfolioUrl, githubUrl, linkedinUrl, message, availabilityDate } = req.body
  if (![name, degreeCourse, department, college, studyYear, domain, skills, experienceLevel, message].every((value) => typeof value === 'string' && value.trim()) || !validateEmail(email)) return fail(res, 'Complete all required internship fields with a valid email.')
  const phone = requestPhone(req, res, true)
  if (!phone) return
  if (![portfolioUrl, githubUrl, linkedinUrl].every(validateUrl)) return fail(res, 'Portfolio, GitHub, and LinkedIn URLs must use http(s).')
  let startDate
  if (availabilityDate) {
    startDate = new Date(availabilityDate)
    if (typeof availabilityDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(availabilityDate) || Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== availabilityDate) return fail(res, 'Enter a valid preferred start date.')
  }
  return respond(res, await InternshipApplication.create({ name: clean(name, 120), email: email.trim(), ...phone, degreeCourse: clean(degreeCourse, 160), department: clean(department, 160), college: clean(college, 180), studyYear: clean(studyYear, 80), domain: clean(domain, 160), skills: clean(skills, 2000), experienceLevel: clean(experienceLevel, 80), portfolioUrl: clean(portfolioUrl, 2000), githubUrl: clean(githubUrl, 2000), linkedinUrl: clean(linkedinUrl, 2000), message: clean(message, 4000), availabilityDate: startDate }), 201)
}
export async function createContact(req, res) {
  if (!(await getConfig()).settings.contactEnabled) return fail(res, 'The contact form is currently unavailable.', 403)
  const { name, email, subject, message, degreeCourse } = req.body
  if (![name, subject, message].every((value) => typeof value === 'string' && value.trim()) || !validateEmail(email)) return fail(res, 'Name, subject, message, and a valid email are required.')
  const phone = requestPhone(req, res)
  if (!phone) return
  return respond(res, await ContactMessage.create({ name: clean(name, 120), email: email.trim(), subject: clean(subject, 160), message: clean(message, 4000), degreeCourse: clean(degreeCourse, 160), ...phone }), 201)
}
export { projectView }
