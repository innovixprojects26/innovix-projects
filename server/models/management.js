import { learningSettings } from '../../shared/learning.js'
import mongoose from 'mongoose'
import { contactConfig, liveClasses, internshipRoles } from '../../src/data.js'

const { Schema, model } = mongoose
export const settingDefaults = { ...learningSettings, newsEnabled: true, internshipsEnabled: true, discoverEnabled: true, discoverImportEnabled: false, discoverPublishingMode: 'manual', projectsEnabled: true, projectEnquiriesEnabled: true, customRequestsEnabled: true, internshipApplicationsEnabled: true, techNewsEnabled: true, testimonialsEnabled: true, contactEnabled: true, supportEmail: contactConfig.email, supportPhone: contactConfig.phone, whatsapp: contactConfig.whatsapp, instagramUrl: 'https://instagram.com', youtubeUrl: '', linkedinUrl: 'https://linkedin.com' }
export const homepageDefaults = { heroHeading: 'Learn by doing.', heroHighlight: 'Build what comes next.', heroSubtitle: 'Explore internship opportunities, gain real-time project experience, develop career-focused skills, and get guidance for your academic and technical projects.', primaryCta: 'Explore Internships', aboutSummary: 'Innovix Projects is a student-focused platform for internships, practical learning, real-time project exposure, skill development, academic project work, and technical guidance.', notice: '' }
export const serviceDefaults = [
  { title: 'Hands-on experience', description: 'Build practical skills through guided work across frontend, design, Python, content, security, and full stack roles.', active: true },
  { title: 'Technical direction', description: 'Get guidance as you plan, build, review, and improve your work. Students from varied academic backgrounds are welcome.', active: true },
  { title: 'Career materials', description: 'Develop portfolio examples and receive support in presenting your experience on a resume and LinkedIn profile.', active: true },
  { title: 'Completion certificate', description: 'Document the experience and skills developed during the internship program.', active: true },
]
const fieldsFor = (defaults) => Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { type: typeof value === 'boolean' ? Boolean : String, default: value }]))
const configSchema = new Schema({ discoverCategoriesInitialized: { type: Boolean, default: false }, _id: { type: String, default: 'website' }, settings: { type: new Schema(fieldsFor(settingDefaults), { _id: false }), default: () => ({}) }, homepage: { type: new Schema(fieldsFor(homepageDefaults), { _id: false }), default: () => ({}) }, services: { type: [{ title: String, description: String, active: { type: Boolean, default: true } }], default: () => serviceDefaults } }, { timestamps: true })
export const WebsiteConfig = model('WebsiteConfig', configSchema)
export const InternshipDomain = model('InternshipDomain', new Schema({ name: { type: String, unique: true, required: true }, active: { type: Boolean, default: true }, applicationsOpen: { type: Boolean, default: true }, liveClassEnabled: { type: Boolean, default: true }, recordedClassesEnabled: { type: Boolean, default: false }, classTitle: { type: String, default: 'Live Class' }, meetingUrl: { type: String, default: '' }, date: { type: String, default: '' }, startTime: { type: String, default: '' }, description: { type: String, default: '' }, classActive: { type: Boolean, default: true } }, { timestamps: true }))
export const Announcement = model('Announcement', new Schema({ title: { type: String, required: true, maxlength: 160 }, message: { type: String, required: true, maxlength: 2000 }, type: { type: String, enum: ['Information', 'Success', 'Warning', 'Important'], default: 'Information' }, startDate: Date, endDate: Date, active: { type: Boolean, default: false } }, { timestamps: true }))
export const AdminActivity = model('AdminActivity', new Schema({ action: String, target: String }, { timestamps: true }))

export async function getConfig() {
  let saved = await WebsiteConfig.findById('website').lean()
  if (!saved) {
    // Atomic singleton initialization: never replace saved settings or seed over edits.
    saved = await WebsiteConfig.findOneAndUpdate({ _id: 'website' }, {
      $setOnInsert: { settings: settingDefaults, homepage: homepageDefaults, services: serviceDefaults },
    }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).lean()
  }
  return { settings: { ...settingDefaults, ...saved?.settings }, homepage: { ...homepageDefaults, ...saved?.homepage }, services: saved?.services ?? serviceDefaults }
}
// Additive, idempotent migration: never overwrites an existing domain or meeting link.
export async function ensureDomains() {
  const names = [...new Set([...internshipRoles, ...liveClasses.map(item => item.name)])]
  await InternshipDomain.init()
  const existing = new Set((await InternshipDomain.find().select('name').lean()).map(item => item.name))
  const missing = names.filter(name => !existing.has(name))
  if (!missing.length) return
  await InternshipDomain.bulkWrite(missing.map(name => ({ updateOne: { filter: { name }, update: { $setOnInsert: { name, active: true, applicationsOpen: true, liveClassEnabled: true, classActive: true, recordedClassesEnabled: name === 'Content Creation', meetingUrl: liveClasses.find(item => item.name === name)?.meetLink || '' } }, upsert: true } })))
}
export async function getDomain(name) {
  if (typeof name !== 'string') return null
  const aliases = { 'Frontend Development': 'Frontend Developer', 'Python Development': 'Python Developer', 'UI/UX Design': 'UI/UX Designer' }
  name = aliases[name] || name
  const saved = await InternshipDomain.findOne({ name }).lean()
  if (saved) return saved
  if (![...internshipRoles, ...liveClasses.map(item => item.name)].includes(name)) return null
  return { name, active: true, applicationsOpen: true, liveClassEnabled: true, recordedClassesEnabled: name === 'Content Creation', classActive: true, meetingUrl: liveClasses.find(item => item.name === name)?.meetLink || '' }
}
export async function recordingEnabled() { const domain = await getDomain('Content Creation'); return domain?.active && domain.recordedClassesEnabled }
