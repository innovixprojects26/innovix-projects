import { Router } from 'express'
import { createProject, createTestimonial, dashboard, adminProjects, deleteMessage, deleteProject, deleteTestimonial, listAdminTestimonials, listCollection, listMessages, login, updateMessageRead, updateProject, updateStatus, updateTestimonial } from '../controllers/admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.post('/login', login)
router.use(requireAuth)
router.get('/dashboard', dashboard)
router.get('/projects', adminProjects)
router.post('/projects', createProject)
router.put('/projects/:id', updateProject)
router.patch('/projects/:id', updateProject)
router.delete('/projects/:id', deleteProject)
router.get('/messages/all', listMessages)
router.patch('/messages/:id/read', updateMessageRead)
router.delete('/messages/:id', deleteMessage)
router.get('/testimonials/all', listAdminTestimonials)
router.post('/testimonials', createTestimonial)
router.put('/testimonials/:id', updateTestimonial)
router.patch('/testimonials/:id', updateTestimonial)
router.delete('/testimonials/:id', deleteTestimonial)
router.get('/:collection', listCollection)
router.patch('/:collection/:id/status', updateStatus)
export default router
