import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { requireStudent, requireStudentCsrf, checkStudentOrigin } from '../middleware/student-auth.js'
import { env } from '../config/env.js'
import { audit } from '../controllers/management.js'
import { feature, id, problem, learningError } from '../services/learning-access.js'
import * as batches from '../controllers/batches.js'
import * as tasks from '../controllers/tasks.js'
import * as files from '../controllers/learning-files.js'
import * as certificates from '../controllers/certificates.js'
import * as notifications from '../controllers/notifications.js'
import * as progress from '../controllers/learning-progress.js'
import { analytics, catalog } from '../controllers/learning-analytics.js'
import { leads, updateLead } from '../controllers/leads.js'
const enabled = name => async (_req, _res, next) => { await feature(name); next() }
const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() }
const ids = (req, _res, next, value) => { if (!id(value)) throw problem('Record not found.', 404); next() }
const studentWrite = [checkStudentOrigin, requireStudentCsrf]
function uploadOrigin(req, _res, next) { if (req.headers.origin !== new URL(env.clientUrl).origin || !req.is('application/octet-stream')) throw problem('Use a binary upload from the configured student website.', 403); next() }
const uploadLimit = () => rateLimit({ windowMs: 3600000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Upload limit reached. Please try again later.' } })

export const learningStudentRoutes = Router()
learningStudentRoutes.use(requireStudent, noStore)
learningStudentRoutes.param('id', ids)
learningStudentRoutes.get('/progress', progress.progress)
learningStudentRoutes.get('/tasks', enabled('tasksEnabled'), tasks.studentTasks)
learningStudentRoutes.post('/tasks/:id/submit', enabled('tasksEnabled'), ...studentWrite, tasks.submitTask)
learningStudentRoutes.put('/tasks/:id/file', enabled('tasksEnabled'), uploadOrigin, requireStudentCsrf, uploadLimit(), files.uploadFile)
learningStudentRoutes.get('/files/:id', enabled('tasksEnabled'), files.downloadFile)
learningStudentRoutes.post('/videos/:id/progress', ...studentWrite, progress.videoActivity)
learningStudentRoutes.get('/notifications', enabled('notificationsEnabled'), notifications.notifications)
learningStudentRoutes.post('/notifications/read-all', enabled('notificationsEnabled'), ...studentWrite, notifications.readNotification)
learningStudentRoutes.post('/notifications/:id/read', enabled('notificationsEnabled'), ...studentWrite, notifications.readNotification)
learningStudentRoutes.get('/gamification', enabled('gamificationEnabled'), progress.gamification)
learningStudentRoutes.get('/leaderboard', enabled('gamificationEnabled'), enabled('leaderboardEnabled'), progress.leaderboard)
learningStudentRoutes.put('/leaderboard-preference', ...studentWrite, progress.leaderboardPreference)
learningStudentRoutes.use(learningError)

export const learningAdminRoutes = Router()
learningAdminRoutes.use(requireAuth, noStore, audit)
learningAdminRoutes.param('id', ids); learningAdminRoutes.param('enrollmentId', ids)
learningAdminRoutes.get('/analytics', analytics)
learningAdminRoutes.get('/catalog', catalog)
learningAdminRoutes.get('/payments', progress.paymentRecords)
learningAdminRoutes.get('/batches', enabled('batchesEnabled'), batches.batches)
learningAdminRoutes.post('/batches', enabled('batchesEnabled'), batches.saveBatch)
learningAdminRoutes.patch('/batches/:id', enabled('batchesEnabled'), batches.saveBatch)
learningAdminRoutes.delete('/batches/:id', enabled('batchesEnabled'), batches.deleteBatch)
learningAdminRoutes.get('/batches/:id/students', enabled('batchesEnabled'), batches.batchStudents)
learningAdminRoutes.post('/batches/:id/students', enabled('batchesEnabled'), batches.assignStudent)
learningAdminRoutes.delete('/batches/:id/students/:enrollmentId', enabled('batchesEnabled'), batches.removeStudent)
learningAdminRoutes.get('/tasks', enabled('tasksEnabled'), tasks.tasks)
learningAdminRoutes.post('/tasks', enabled('tasksEnabled'), tasks.saveTask)
learningAdminRoutes.patch('/tasks/:id', enabled('tasksEnabled'), tasks.saveTask)
learningAdminRoutes.put('/tasks/:id/file', enabled('tasksEnabled'), uploadLimit(), files.uploadFile)
learningAdminRoutes.get('/files/:id', enabled('tasksEnabled'), files.downloadFile)
learningAdminRoutes.get('/submissions', enabled('tasksEnabled'), tasks.submissions)
learningAdminRoutes.patch('/submissions/:id', enabled('tasksEnabled'), tasks.reviewSubmission)
learningAdminRoutes.get('/certificates', enabled('certificateVerificationEnabled'), certificates.certificates)
learningAdminRoutes.get('/eligibility/:id', enabled('certificateVerificationEnabled'), certificates.certificateEligibility)
learningAdminRoutes.post('/certificates', enabled('certificateVerificationEnabled'), certificates.issueCertificate)
learningAdminRoutes.post('/certificates/:id/revoke', enabled('certificateVerificationEnabled'), certificates.revokeCertificate)
learningAdminRoutes.get('/notifications', enabled('notificationsEnabled'), notifications.adminNotifications)
learningAdminRoutes.post('/notifications', enabled('notificationsEnabled'), notifications.sendNotification)
learningAdminRoutes.get('/leads', leads)
learningAdminRoutes.patch('/leads/:id', updateLead)
learningAdminRoutes.use(learningError)

export const certificatePublicRoutes = Router()
certificatePublicRoutes.use(noStore, enabled('certificateVerificationEnabled'), rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }))
certificatePublicRoutes.get('/:certificateId', certificates.verifyCertificate)
certificatePublicRoutes.use(learningError)
