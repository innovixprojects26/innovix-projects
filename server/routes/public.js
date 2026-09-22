import { Router } from 'express'
import { createContact, createCustomProject, createEnquiry, createInternship, listProjects, listTestimonials } from '../controllers/public.js'

const router = Router()
router.get('/projects', listProjects)
router.get('/projects/:slug', listProjects)
router.get('/testimonials', listTestimonials)
router.post('/enquiries', createEnquiry)
router.post('/custom-projects', createCustomProject)
router.post('/internships/apply', createInternship)
router.post('/contact', createContact)
export default router
