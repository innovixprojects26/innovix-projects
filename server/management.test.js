import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { env } from './config/env.js'
import adminRoutes from './routes/admin.js'
import publicRoutes from './routes/public.js'
import studentRoutes from './routes/student.js'
import { contentVideoPublicRoutes } from './routes/content-videos.js'
import { Admin, Project, ContactMessage, Enquiry, InternshipApplication, CustomProject } from './models/index.js'
import { Student, StudentSession } from './models/student.js'
import { WebsiteConfig, InternshipDomain, AdminActivity, ensureDomains } from './models/management.js'
import { liveClasses } from '../src/data.js'

test('central admin management preserves data and enforces public availability and suspension', async () => {
  const dbName = `mgt_${randomUUID().replaceAll('-', '')}`
  let server
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await Promise.all([Admin.init(), Student.init(), StudentSession.init(), Project.init()])
    const untouchedDomain = await InternshipDomain.create({ name: 'Data Analytics', active: false, applicationsOpen: false, liveClassEnabled: false, recordedClassesEnabled: true, meetingUrl: 'https://example.test/unchanged' })
    const contentLiveSettings = { name: 'Content Creation', liveClassEnabled: true, classActive: true, recordedClassesEnabled: true, classTitle: 'Existing Content session', meetingUrl: liveClasses.find(item => item.name === 'Content Creation').meetLink, date: '2026-10-04', startTime: '10:30', description: 'Preserve the configured session.' }
    await InternshipDomain.create(contentLiveSettings)
    const password = 'Learn@Code9'
    await Admin.create({ email: 'admin@example.test', passwordHash: await bcrypt.hash(password, 4) })
    const app = express()
    app.use(express.json())
    app.use('/api/admin', adminRoutes)
    app.use('/api/student', studentRoutes)
    app.use('/api/content-creation/videos', contentVideoPublicRoutes)
    app.use('/api', publicRoutes)
    app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }))
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api`
    let token
    const request = async (path, method = 'GET', body, extra = {}) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: new URL(env.clientUrl).origin, ...(token && path.startsWith('/admin') ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, cookie: response.headers.get('set-cookie'), ...await response.json() }
    }
    for (const path of ['/admin/configuration', '/admin/students', '/admin/internship-domains', '/admin/internships', '/admin/announcements', '/admin/activity']) assert.equal((await request(path)).status, 401)
    assert.equal((await request('/admin/login', 'POST', { email: 'admin@example.test', password: 'wrong' })).status, 401)
    token = (await request('/admin/login', 'POST', { email: 'admin@example.test', password })).data.token
    assert.ok(token)
    assert.equal(await WebsiteConfig.countDocuments(), 0)
    const initialResponse = await request('/configuration')
    assert.equal(initialResponse.status, 200)
    assert.equal(initialResponse.success, true)
    const defaults = initialResponse.data
    assert.equal(await WebsiteConfig.countDocuments(), 1, 'A fresh database persists the singleton defaults')
    assert.equal(defaults.settings.newsEnabled, true)
    assert.equal(defaults.settings.internshipsEnabled, true)
    const contentTrack = defaults.domains.find(item => item.name === 'Content Creation')
    assert.equal(contentTrack.recordedClassesEnabled, false)
    assert.equal(contentTrack.liveClassEnabled, true)
    for (const field of ['classTitle', 'meetingUrl', 'date', 'startTime', 'description', 'classActive']) assert.equal(contentTrack[field], contentLiveSettings[field], `Content Creation live-class setting ${field} remains unchanged`)
    assert.equal((await request(`/admin/internship-domains/${contentTrack._id}`, 'PATCH', { recordedClassesEnabled: true })).status, 200)
    await ensureDomains()
    assert.equal((await request('/admin/internship-domains')).data.find(item => item.name === 'Content Creation').recordedClassesEnabled, true)
    assert.equal((await request(`/admin/internship-domains/${contentTrack._id}`, 'PATCH', { recordedClassesEnabled: false })).status, 200)
    const cyberTrack = (await request('/admin/internship-domains')).data.find(item => item.name === 'Cyber Security')
    assert.equal(cyberTrack.liveClassEnabled, true)
    assert.equal(cyberTrack.classActive, true)
    assert.equal(cyberTrack.recordedClassesEnabled, true)
    assert.equal(cyberTrack.meetingUrl, '')
    const cyberUrl = 'https://zoom.us/j/123456789'
    assert.equal((await request(`/admin/internship-domains/${cyberTrack._id}`, 'PATCH', { meetingUrl: cyberUrl, liveClassEnabled: false, recordedClassesEnabled: false })).status, 200)
    await ensureDomains()
    const persistedCyber = (await request('/admin/internship-domains')).data.find(item => item.name === 'Cyber Security')
    assert.equal(persistedCyber.liveClassEnabled, false)
    assert.equal(persistedCyber.recordedClassesEnabled, false)
    assert.equal(persistedCyber.meetingUrl, cyberUrl)
    assert.equal((await InternshipDomain.findById(untouchedDomain._id).lean()).meetingUrl, 'https://example.test/unchanged')
    assert.equal((await InternshipDomain.findById(untouchedDomain._id).lean()).recordedClassesEnabled, true)
    assert.equal((await request(`/admin/internship-domains/${cyberTrack._id}`, 'PATCH', { liveClassEnabled: true, recordedClassesEnabled: true })).status, 200)
    assert.equal((await request('/configuration')).data.domains.find(item => item.name === 'Cyber Security').meetingUrl, '')
    assert.equal((await request('/configuration')).data.domains.find(item => item.name === 'Content Creation').recordedClassesEnabled, false)
    // Delete only in this isolated test database, never the configured application database.
    await WebsiteConfig.deleteOne({ _id: 'website' })
    const simultaneous = await Promise.all(Array.from({ length: 5 }, () => request('/configuration')))
    assert.ok(simultaneous.every(response => response.status === 200 && response.success))
    assert.equal(await WebsiteConfig.countDocuments(), 1, 'Concurrent initialization creates one document')
    assert.equal(defaults.settings.projectsEnabled, true)
    const originalMeeting = liveClasses.find(item => item.name === 'Content Creation').meetLink
    assert.equal(defaults.domains.find(item => item.name === 'Content Creation').meetingUrl, originalMeeting)
    const track = (await request('/admin/internship-domains')).data.find(item => item.name === 'Content Creation')
    assert.equal((await request(`/admin/internship-domains/${track._id}`, 'PATCH', { meetingUrl: 'javascript:alert(1)' })).status, 400)
    assert.equal((await request(`/admin/internship-domains/${track._id}`, 'PATCH', { classTitle: 'Updated class', meetingUrl: 'https://example.test/meeting', description: 'New session', date: '2026-10-01', startTime: '10:30' })).status, 200)
    await ensureDomains()
    assert.equal((await request('/configuration')).data.domains.find(item => item.name === track.name).meetingUrl, 'https://example.test/meeting')

    const project = { title: 'Managed project', slug: 'managed-project', description: 'Test project', domain: 'Software', level: 'Beginner', projectType: 'Mini Project', price: 3000, published: false, available: true }
    const created = await request('/admin/projects', 'POST', project)
    assert.equal(created.status, 201)
    const id = created.data._id
    assert.equal((await request('/projects')).data.length, 0)
    assert.equal((await request(`/admin/projects/${id}`, 'PATCH', { published: true, price: 3500, featured: true })).status, 200)
    assert.equal((await request('/projects/managed-project')).data.price, 3500)
    const enquiry = { studentName: 'Learner', email: 'learner@example.test', phoneCountry: 'IN', phone: '9876543210', project: id }
    assert.equal((await request('/enquiries', 'POST', enquiry)).status, 201)
    await request(`/admin/projects/${id}`, 'PATCH', { available: false })
    assert.equal((await request('/projects')).data[0].available, false)
    assert.equal((await request('/enquiries', 'POST', enquiry)).status, 403)
    await request(`/admin/projects/${id}`, 'PATCH', { visibleWhenUnavailable: false })
    assert.equal((await request('/projects')).data.length, 0)
    assert.equal((await request('/projects/managed-project')).status, 404)
    await request(`/admin/projects/${id}`, 'PATCH', { available: true })
    assert.equal((await request('/projects')).data.length, 1)
    // Legacy records without new fields retain availability.
    await Project.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { available: 1, visibleWhenUnavailable: 1 } })
    assert.equal((await request('/enquiries', 'POST', enquiry)).status, 201)
    assert.equal((await request('/admin/configuration/settings', 'PUT', { projectsEnabled: false })).status, 200)
    assert.equal((await request('/projects')).data.length, 0)
    assert.equal((await request('/projects/managed-project')).status, 403)
    assert.equal((await request('/enquiries', 'POST', enquiry)).status, 403)
    assert.equal(await Project.countDocuments(), 1)
    await request('/admin/configuration/settings', 'PUT', { projectsEnabled: true, projectEnquiriesEnabled: false, customRequestsEnabled: false, internshipApplicationsEnabled: false, contactEnabled: false, techNewsEnabled: false, testimonialsEnabled: false })
    for (const path of ['/enquiries', '/custom-projects', '/internships/apply', '/contact']) assert.equal((await request(path, 'POST', {})).status, 403, path)
    assert.deepEqual((await request('/tech-news')).data, [])
    assert.equal((await request('/tech-news/123')).status, 404)
    assert.deepEqual((await request('/testimonials')).data, [])
    await request('/admin/configuration/settings', 'PUT', { projectEnquiriesEnabled: true, internshipApplicationsEnabled: true, contactEnabled: true, testimonialsEnabled: true })
    assert.equal((await request('/admin/configuration/settings', 'PUT', { unknownSecret: 'no' })).status, 400)
    assert.equal((await request('/admin/configuration/settings', 'PUT', { instagramUrl: 'javascript:alert(1)' })).status, 400)
    assert.equal((await request('/admin/configuration/homepage', 'PUT', { heroHeading: 'New headline', primaryCta: 'Start learning', aboutSummary: 'New summary' })).status, 200)
    assert.equal((await request('/admin/configuration/services', 'PUT', [{ title: 'Mentoring', description: 'Guided learning', active: true }])).status, 200)
    assert.equal((await request('/configuration')).data.homepage.heroHeading, 'New headline')
    assert.equal((await request('/configuration')).data.services[0].title, 'Mentoring')
    assert.ok(await WebsiteConfig.findById('website'))
    const beforeRead = await WebsiteConfig.findById('website').lean()
    const existing = await request('/configuration')
    assert.equal(existing.status, 200)
    assert.equal(existing.data.settings.techNewsEnabled, false, 'Existing switches are never reseeded')
    assert.equal(existing.data.homepage.heroHeading, 'New headline')
    assert.deepEqual(await WebsiteConfig.findById('website').lean(), beforeRead, 'Reads do not rewrite existing configuration')
    await request('/admin/configuration/settings', 'PUT', { newsEnabled: false, techNewsEnabled: true, internshipsEnabled: false })
    assert.deepEqual((await request('/tech-news')).data, [])
    assert.equal((await request('/tech-news/123')).status, 404)
    assert.equal((await request('/internships/apply', 'POST', { domain: track.name })).status, 403)
    const disabled = (await request('/configuration')).data
    assert.equal(disabled.settings.newsEnabled, false)
    assert.equal(disabled.settings.techNewsEnabled, true, 'Individual switches retain their saved values')
    assert.equal(disabled.domains.find(item => item.name === track.name).meetingUrl, 'https://example.test/meeting')
    assert.equal((await request('/admin/configuration/settings', 'PUT', { newsEnabled: 'false' })).status, 400)
    await request('/admin/configuration/settings', 'PUT', { newsEnabled: true, internshipsEnabled: true })
    await request(`/admin/internship-domains/${track._id}`, 'PATCH', { applicationsOpen: false })
    assert.equal((await request('/internships/apply', 'POST', { domain: track.name })).status, 403)
    await request(`/admin/internship-domains/${track._id}`, 'PATCH', { applicationsOpen: true })
    const application = await request('/internships/apply', 'POST', { name: 'Applicant', email: 'apply@example.test', phoneCountry: 'IN', phone: '9876543210', degreeCourse: 'BSc', department: 'IT', college: 'College', studyYear: 'Final', domain: track.name, skills: 'Writing', experienceLevel: 'Beginner', message: 'Ready to learn' })
    assert.equal(application.status, 201)
    await InternshipApplication.updateOne({ _id: application.data._id }, { $set: { createdAt: new Date('2020-01-01T00:00:00.000Z') } })
    const newApplication = await request('/internships/apply', 'POST', { name: 'New applicant', email: 'new-apply@example.test', phoneCountry: 'IN', phone: '9876543212', degreeCourse: 'BSc', department: 'IT', college: 'New College', studyYear: 'Final', domain: track.name, skills: 'Writing', experienceLevel: 'Beginner', message: 'Ready to learn' })
    assert.equal(newApplication.status, 201)
    const adminApplications = await request('/admin/internships')
    assert.equal(adminApplications.status, 200)
    assert.ok(adminApplications.data.some(item => item._id === application.data._id), 'Existing application remains visible')
    assert.ok(adminApplications.data.some(item => item._id === newApplication.data._id), 'New public application is visible to Admin')
    assert.equal(adminApplications.data[0]._id, newApplication.data._id, 'Admin applications are newest first')
    assert.equal(adminApplications.data[0].name, 'New applicant')
    assert.equal(adminApplications.data[0].email, 'new-apply@example.test')
    assert.equal(adminApplications.data[0].college, 'New College')
    assert.equal(adminApplications.data[0].domain, track.name)
    assert.equal((await request(`/admin/internships/${application.data._id}/status`, 'PATCH', { status: 'Reviewed' })).status, 200)

    const registration = { fullName: 'Learner', email: 'student@example.test', phoneCountry: 'IN', phone: '9876543210', college: 'College', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: track.name, password, confirmPassword: password }
    assert.equal((await request('/student/register', 'POST', registration)).status, 201)
    const login = await request('/student/login', 'POST', { email: registration.email, password, rememberMe: true })
    assert.equal(login.status, 200)
    const cookie = login.cookie.split(';')[0]
    assert.equal((await request('/student/dashboard', 'GET', undefined, { Cookie: cookie })).data.liveClassUrl, 'https://example.test/meeting')
    await request(`/admin/internship-domains/${track._id}`, 'PATCH', { classActive: false })
    assert.equal((await request('/student/dashboard', 'GET', undefined, { Cookie: cookie })).data.liveClassUrl, 'https://example.test/meeting')
    assert.equal((await request('/configuration')).data.domains.find(item => item.name === track.name).meetingUrl, 'https://example.test/meeting')
    await request(`/admin/internship-domains/${track._id}`, 'PATCH', { classActive: true })
    await request(`/admin/internship-domains/${track._id}`, 'PATCH', { liveClassEnabled: false, recordedClassesEnabled: false })
    assert.equal((await request('/student/dashboard', 'GET', undefined, { Cookie: cookie })).data.liveClassUrl, null)
    assert.equal((await request('/content-creation/videos', 'GET', undefined, { Cookie: cookie })).status, 403)
    await request(`/admin/internship-domains/${track._id}`, 'PATCH', { active: false })
    assert.ok(!(await request('/configuration')).data.domains.some(item => item.name === track.name))
    const students = await request('/admin/students?search=Learner&status=active&domain=Content%20Creation')
    assert.equal(students.data.length, 1)
    const studentId = students.data[0]._id
    for (const secret of ['passwordHash', 'authVersion', 'resetToken', 'sessionToken']) assert.ok(!JSON.stringify(students).includes(secret))
    assert.equal((await request(`/admin/students/${studentId}/account-status`, 'PATCH', { accountStatus: 'suspended' })).status, 200)
    assert.equal(await StudentSession.countDocuments(), 0)
    assert.equal((await request('/student/me', 'GET', undefined, { Cookie: cookie })).status, 401)
    assert.equal((await request('/student/login', 'POST', { email: registration.email, password, rememberMe: false })).status, 401)
    await request(`/admin/students/${studentId}/account-status`, 'PATCH', { accountStatus: 'active' })
    assert.equal((await request('/student/me', 'GET', undefined, { Cookie: cookie })).status, 401)
    assert.equal((await request('/student/login', 'POST', { email: registration.email, password, rememberMe: false })).status, 200)

    const announcement = await request('/admin/announcements', 'POST', { title: 'Hello', message: 'Welcome interns', type: 'Information', active: true })
    assert.equal(announcement.status, 201)
    assert.equal((await request('/configuration')).data.announcements.length, 1)
    await request(`/admin/announcements/${announcement.data._id}`, 'PUT', { startDate: '2099-01-01T00:00:00Z' })
    assert.equal((await request('/configuration')).data.announcements.length, 0)
    await request(`/admin/announcements/${announcement.data._id}`, 'DELETE')
    const testimonial = await request('/admin/testimonials', 'POST', { studentName: 'Learner', review: 'Helpful guidance', published: false })
    assert.equal(testimonial.status, 201)
    assert.equal((await request('/testimonials')).data.length, 0)
    await request(`/admin/testimonials/${testimonial.data._id}`, 'PATCH', { published: true })
    assert.equal((await request('/testimonials')).data.length, 1)
    const message = await request('/contact', 'POST', { name: 'Customer', email: 'customer@example.test', subject: 'Hello', message: 'A question' })
    assert.equal(message.status, 201)
    await request(`/admin/messages/${message.data._id}/read`, 'PATCH', { read: true })
    assert.equal((await ContactMessage.findById(message.data._id)).read, true)
    const savedEnquiry = await Enquiry.findOne()
    assert.equal((await request(`/admin/enquiries/${savedEnquiry._id}/status`, 'PATCH', { status: 'Completed' })).status, 200)
    const custom = await CustomProject.create({ studentName: 'Learner', email: 'custom@example.test', projectIdea: 'Idea' })
    assert.equal((await request(`/admin/custom/${custom._id}/status`, 'PATCH', { status: 'Accepted' })).status, 200)
    assert.equal((await request('/admin/dashboard')).data.totalStudents, 1)
    const cyberRegistration = { ...registration, email: 'cyber-student@example.test', phone: '9876543211', internshipDomain: 'Cyber Security' }
    assert.equal((await request('/student/register', 'POST', cyberRegistration)).status, 201)
    const cyberLogin = await request('/student/login', 'POST', { email: cyberRegistration.email, password, rememberMe: true })
    assert.equal(cyberLogin.status, 200)
    const cyberCookie = cyberLogin.cookie.split(';')[0]
    const cyberDashboard = (await request('/student/dashboard', 'GET', undefined, { Cookie: cyberCookie })).data
    assert.equal(cyberDashboard.liveClassUrl, cyberUrl)
    assert.equal(cyberDashboard.recordedClassesAvailable, true)
    await request(`/admin/internship-domains/${cyberTrack._id}`, 'PATCH', { meetingUrl: '' })
    assert.equal((await request('/student/dashboard', 'GET', undefined, { Cookie: cyberCookie })).data.liveClassUrl, null)
    await request(`/admin/internship-domains/${cyberTrack._id}`, 'PATCH', { meetingUrl: cyberUrl })
    assert.equal((await request('/configuration')).data.domains.find(item => item.name === 'Cyber Security').meetingUrl, '')
    assert.equal((await request('/admin/profile')).data.email, 'admin@example.test')
    assert.ok(await AdminActivity.countDocuments() > 0)
    assert.ok(!JSON.stringify((await request('/admin/activity')).data).includes(password))
    assert.equal(await InternshipApplication.countDocuments(), 2)
    assert.equal(await InternshipDomain.countDocuments(), liveClasses.length)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  }
})
