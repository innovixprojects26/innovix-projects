import { audit } from '../controllers/management.js'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireStudent } from '../middleware/student-auth.js'
import { adminContentVideos, deleteContentVideo, listContentVideos, previewContentVideo, reorderContentVideos, saveContentVideo, streamContentMedia, uploadContentMedia, withVideo } from '../controllers/content-videos.js'

export const contentVideoPublicRoutes = Router()
contentVideoPublicRoutes.get('/', requireStudent, listContentVideos)
contentVideoPublicRoutes.get('/:id/media/:kind', streamContentMedia)

export const contentVideoAdminRoutes = Router()
contentVideoAdminRoutes.use(requireAuth)
contentVideoAdminRoutes.use(audit)
contentVideoAdminRoutes.get('/', adminContentVideos)
contentVideoAdminRoutes.post('/', saveContentVideo)
contentVideoAdminRoutes.put('/reorder', reorderContentVideos)
contentVideoAdminRoutes.patch('/:id', withVideo, saveContentVideo)
contentVideoAdminRoutes.delete('/:id', withVideo, deleteContentVideo)
contentVideoAdminRoutes.post('/:id/preview', withVideo, previewContentVideo)
// Raw binary stream: files are never buffered by express.json or written into MongoDB.
contentVideoAdminRoutes.put('/:id/upload/:kind', withVideo, uploadContentMedia)
