import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireStudent, checkStudentOrigin, requireStudentCsrf } from '../middleware/student-auth.js'
import { requireAuth } from '../middleware/auth.js'
import { audit } from '../controllers/management.js'
import * as discover from '../controllers/discover.js'

export const discoverStudentRoutes = Router()
discoverStudentRoutes.use(requireStudent, discover.discoverEnabled)
discoverStudentRoutes.param('id', discover.discoverId)
discoverStudentRoutes.get('/', discover.studentFeed)
discoverStudentRoutes.get('/:id', discover.studentDetail)
discoverStudentRoutes.post('/:id/read', checkStudentOrigin, requireStudentCsrf, discover.markRead)
discoverStudentRoutes.use(discover.discoverError)

export const discoverAdminRoutes = Router()
discoverAdminRoutes.use(requireAuth, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() }, audit)
discoverAdminRoutes.param('id', discover.discoverId)
discoverAdminRoutes.get('/items', discover.adminItems)
discoverAdminRoutes.post('/items', discover.saveItem)
discoverAdminRoutes.patch('/items/:id', discover.saveItem)
discoverAdminRoutes.delete('/items/:id', discover.deleteItem)
discoverAdminRoutes.get('/sources', discover.sources)
discoverAdminRoutes.post('/sources', discover.saveSource)
discoverAdminRoutes.patch('/sources/:id', discover.saveSource)
discoverAdminRoutes.delete('/sources/:id', discover.deleteSource)
discoverAdminRoutes.post('/refresh', rateLimit({ windowMs: 60000, limit: 2, standardHeaders: 'draft-7', legacyHeaders: false }), discover.refreshSources)
discoverAdminRoutes.get('/categories', discover.categories)
discoverAdminRoutes.post('/categories', discover.saveCategory)
discoverAdminRoutes.patch('/categories/:id', discover.saveCategory)
discoverAdminRoutes.delete('/categories/:id', discover.deleteCategory)
discoverAdminRoutes.use(discover.discoverError)
