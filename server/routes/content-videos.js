import { selectLearningDomain } from '../middleware/learning-domain.js'

import { audit } from '../controllers/management.js'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireStudent } from '../middleware/student-auth.js'
import {
  learningError,
  problem,
  studentHasDomainAccess
} from '../services/learning-access.js'

import {
  adminContentVideos,
  deleteContentVideo,
  listContentVideos,
  previewContentVideo,
  reorderContentVideos,
  saveContentVideo,
  streamContentMedia,
  uploadContentMedia,
  withVideo
} from '../controllers/content-videos.js'

// Verified Razorpay TEST payment required for student video lists.
const requirePaidRecording = async (req, _res, next) => {
  if (!await studentHasDomainAccess(req.student)) {
    throw problem(
      'Complete and verify your internship payment to unlock recorded classes.',
      403
    )
  }
  next()
}

export const contentVideoPublicRoutes = Router()

contentVideoPublicRoutes.get(
  '/',
  requireStudent,
  selectLearningDomain,
  requirePaidRecording,
  listContentVideos
)

// Do not add requireStudent here.
// The controller already validates either:
// 1. A signed Admin Preview token, or
// 2. A student session, payment, domain and lesson sequence.
contentVideoPublicRoutes.get(
  '/:id/media/:kind',
  streamContentMedia
)

contentVideoPublicRoutes.use(learningError)

export const contentVideoAdminRoutes = Router()

contentVideoAdminRoutes.use(requireAuth)
contentVideoAdminRoutes.use(audit)

contentVideoAdminRoutes.get('/', adminContentVideos)
contentVideoAdminRoutes.post('/', saveContentVideo)
contentVideoAdminRoutes.put('/reorder', reorderContentVideos)
contentVideoAdminRoutes.patch('/:id', withVideo, saveContentVideo)
contentVideoAdminRoutes.delete('/:id', withVideo, deleteContentVideo)
contentVideoAdminRoutes.post('/:id/preview', withVideo, previewContentVideo)

// Raw binary stream: files are never buffered by express.json
// or written into MongoDB.
contentVideoAdminRoutes.put(
  '/:id/upload/:kind',
  withVideo,
  uploadContentMedia
)
