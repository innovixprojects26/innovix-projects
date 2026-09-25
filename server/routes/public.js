import { Router } from 'express'
import { listNews, readNews } from '../controllers/tech-news.js'
import { createContact, createCustomProject, createEnquiry, createInternship, listProjects, listTestimonials } from '../controllers/public.js'

const router = Router()
router.get('/tech-news', listNews)
router.get('/tech-news/:id', readNews)
router.get('/projects', listProjects)
router.get('/projects/:slug', listProjects)
router.get('/testimonials', listTestimonials)
router.post('/enquiries', createEnquiry)
router.post('/custom-projects', createCustomProject)
router.post('/internships/apply', createInternship)
router.post('/contact', createContact)
export default router
