import { studentDomains } from '../../shared/student.js'
import { VideoProgress } from '../models/learning.js'
import { recordingEnabled } from '../models/management.js'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { createHmac } from 'node:crypto'
import { ContentVideo } from '../models/content-video.js'
import { env } from '../config/env.js'
import { fail, respond } from '../utils/api.js'
import { loadStudentSession } from '../middleware/student-auth.js'
import { mediaTypes, receiveMedia, removeMedia, storagePath } from '../storage/content-videos.js'
import { studentHasDomainAccess } from '../services/learning-access.js'
import { videoSequence } from '../services/learning-stages.js'

const videoDomains = new Set(studentDomains)
const domainFilter = (domain) => domain === 'Content Creation'
  ? { $or: [{ domain }, { domain: { $exists: false } }] }
  : { domain }
const visible = (domain) => ({ $and: [domainFilter(domain), { status: 'published', publishDate: { $lte: new Date() } }, { $or: [{ videoFile: { $exists: true, $ne: null } }, { videoUrl: { $exists: true, $ne: '' } }] }] })
const order = { position: 1, _id: 1 }
const locks = new Set()
const sequenceLocked = (sequence, videoId) => sequence.get(String(videoId))?.locked ?? true
const previewSecret = () => createHmac('sha256', env.jwtSecret).update('content-creation-media-preview').digest('hex')
export function videoDto(item, includeSource = false) {
  return { _id: item._id, required: item.required !== false, domain: item.domain || 'Content Creation', title: item.title, module: item.module, description: item.description, publishDate: item.publishDate, status: item.status, duration: item.duration, position: item.position, hasVideo: Boolean(item.videoFile || item.videoUrl), hasUpload: Boolean(item.videoFile), hasThumbnail: Boolean(item.thumbnailFile), ...(includeSource ? { videoUrl: item.videoUrl || '' } : {}) }
}
export async function listContentVideos(req, res) {
  const domain = req.student.internshipDomain
  if (!videoDomains.has(domain)) return fail(res, 'Recorded classes are not available for your domain.', 403)
  if (!await studentHasDomainAccess(req.student)) return fail(res, 'Internship enrollment is required to access recorded classes.', 403)
  if (!await recordingEnabled(domain)) return fail(res, 'Recorded classes are currently unavailable.', 403)
  const items = await ContentVideo.find(visible(domain)).sort(order).lean()
  const progress = await VideoProgress.find({ student: req.student._id, video: { $in: items.map(item => item._id) } }).lean()
  const sequence = await videoSequence(req.student, domain)
  return respond(res, items.map(item => ({ ...videoDto(item), completed: Boolean(progress.find(row => String(row.video) === String(item._id))?.completedAt), locked: sequence.get(String(item._id))?.locked ?? true })))
}
export async function adminContentVideos(req, res) {
  const domain = req.query.domain || 'Content Creation'
  if (!videoDomains.has(domain)) return fail(res, 'Unknown internship domain.', 400)
  return respond(res, (await ContentVideo.find(domainFilter(domain)).sort(order).lean()).map(item => videoDto(item, true)))
}

export async function withVideo(req, res, next) {
  const id = req.params.id
  if (!mongoose.isObjectIdOrHexString(id)) return fail(res, 'Video not found', 404)
  if (locks.has(id)) return fail(res, 'This video is being updated. Try again shortly.', 409)
  locks.add(id)
  const release = () => locks.delete(id)
  res.once('finish', release)
  res.once('close', release)
  try {
    req.contentVideo = await ContentVideo.findById(id)
    if (!req.contentVideo) return fail(res, 'Video not found', 404)
    next()
  } catch (error) { release(); next(error) }
}

export async function saveContentVideo(req, res) {
  const article = req.contentVideo || new ContentVideo()
  if (!req.contentVideo) {
    const domain = req.body?.domain || 'Content Creation'
    if (!videoDomains.has(domain)) return fail(res, 'Unknown internship domain.')
    article.domain = domain
  }
  for (const field of ['title', 'module', 'description', 'publishDate', 'status', 'duration']) {
    if (!Object.hasOwn(req.body || {}, field)) continue
    const value = req.body[field]
    if (field === 'duration' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string') return fail(res, `Invalid ${field}`)
    article.set(field, value)
  }
  if ('required' in (req.body || {})) {
    if (typeof req.body.required !== 'boolean') return fail(res, 'Choose a valid required lesson state.')
    article.required = req.body.required
  }
  if ('videoUrl' in (req.body || {})) {
    if (typeof req.body.videoUrl !== 'string' || req.body.videoUrl.length > 2000) return fail(res, 'Enter a valid direct video URL.')
    const videoUrl = req.body.videoUrl.trim()
    if (videoUrl && !validDirectVideoUrl(videoUrl)) return fail(res, 'Video links must be secure direct MP4, WebM or MOV URLs.')
    if (videoUrl && article.videoFile) return fail(res, 'Use either an uploaded video or a direct video link, not both.')
    article.videoUrl = videoUrl
  }
  if (article.videoFile && article.videoUrl) return fail(res, 'Use either an uploaded video or a direct video link, not both.')
  if (article.status === 'published' && !(article.duration > 0)) return fail(res, 'Set a valid video duration before publishing so completion can be tracked.')
  if (article.status === 'published' && !article.videoFile && !article.videoUrl) return fail(res, 'Upload a video or add a secure direct video link before publishing.')
  try { await article.save(); return respond(res, videoDto(article), req.params.id ? 200 : 201) }
  catch (error) { if (error.name === 'ValidationError') return fail(res, Object.values(error.errors).map((entry) => entry.message).join(' ')); throw error }
}

export async function uploadContentMedia(req, res) {
  const item = req.contentVideo
  if (req.params.kind === 'video' && item.videoUrl) return fail(res, 'Remove the video link before uploading a file.')
  const thumbnail = req.params.kind === 'thumbnail'
  if (!thumbnail && req.params.kind !== 'video') return fail(res, 'Unknown upload type', 404)
  const field = thumbnail ? 'thumbnailFile' : 'videoFile'
  if (item[field]) return fail(res, 'This file is already uploaded. Create a new video to replace the recording.', 409)
  let uploaded
  try {
    uploaded = await receiveMedia(req, String(req.headers['x-file-extension'] || '').toLowerCase(), thumbnail)
    item[field] = uploaded.filename
    if (!thumbnail) item.videoBytes = uploaded.bytes
    await item.save()
    return respond(res, videoDto(item))
  } catch (error) {
    if (uploaded) await removeMedia(uploaded.filename)
    if (!res.destroyed) return fail(res, error.status ? error.message : 'Upload failed. Please try again.', error.status || 500)
  }
}

export async function deleteContentVideo(req, res) {
  const item = req.contentVideo
  // Hide first, including if a filesystem error requires the admin to retry deletion.
  item.status = 'draft'
  await item.save()
  await removeMedia(item.videoFile)
  await removeMedia(item.thumbnailFile)
  await item.deleteOne()
  return respond(res, { deleted: true })
}

export async function reorderContentVideos(req, res) {
  const ids = req.body?.ids
  const domain = req.body?.domain || 'Content Creation'
  if (!videoDomains.has(domain)) return fail(res, 'Unknown internship domain.')
  if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || new Set(ids).size !== ids.length || ids.some((id) => !mongoose.isObjectIdOrHexString(id))) return fail(res, 'Provide a unique ordered list of video IDs.')
  const current = await ContentVideo.find(domainFilter(domain)).select('_id').lean()
  if (ids.length !== current.length || current.some((item) => !ids.includes(String(item._id)))) return fail(res, 'The video list changed. Refresh and try again.', 409)
  // Transaction prevents partially applied ordering if a write fails.
  await mongoose.connection.transaction(async (session) => {
    await ContentVideo.bulkWrite(ids.map((id, position) => ({ updateOne: { filter: { _id: id }, update: { $set: { position } } } })), { session })
  })
  return respond(res, (await ContentVideo.find(domainFilter(domain)).sort(order).lean()).map(videoDto))
}

export async function previewContentVideo(req, res) {
  if (!req.contentVideo.videoFile && !req.contentVideo.videoUrl) return fail(res, 'Add or upload a video before previewing.')
  const token = jwt.sign({ purpose: 'content-video-preview', videoId: String(req.contentVideo._id) }, previewSecret(), { expiresIn: '4h', audience: 'content-video-media' })
  res.set('Cache-Control', 'no-store')
  return respond(res, { token })
}

export async function streamContentMedia(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !['video', 'thumbnail'].includes(req.params.kind)) return fail(res, 'Video not found', 404)
  let preview = false
  if (typeof req.query.preview === 'string') {
    try {
      const claim = jwt.verify(req.query.preview, previewSecret(), { audience: 'content-video-media' })
      preview = claim.purpose === 'content-video-preview' && claim.videoId === req.params.id
    } catch { return fail(res, 'Preview expired. Open Preview again from Admin.', 401) }
  }
  if (!preview) {
    if (!await loadStudentSession(req)) return fail(res, 'Please log in to watch recorded classes.', 401)
    if (!videoDomains.has(req.student.internshipDomain)) return fail(res, 'These recorded classes are not available for your domain.', 403)
    if (!await studentHasDomainAccess(req.student)) return fail(res, 'Internship enrollment is required to access recorded classes.', 403)
    if (!await recordingEnabled(req.student.internshipDomain)) return fail(res, 'Recorded classes are currently unavailable.', 403)
  }
  const item = await ContentVideo.findOne({
    _id: req.params.id,
    ...(preview ? {} : visible(req.student.internshipDomain)),
  }).lean()
  if (!preview && item && (item.domain || 'Content Creation') !== req.student.internshipDomain) return fail(res, 'These recorded classes are for another internship domain.', 403)
  const filename = item?.[req.params.kind === 'thumbnail' ? 'thumbnailFile' : 'videoFile']
  const videoUrl = req.params.kind === 'video' ? item?.videoUrl : ''
  if (!filename && !videoUrl) return fail(res, 'Media not found', 404)
  if (!preview && req.params.kind === 'video' && sequenceLocked(await videoSequence(req.student, req.student.internshipDomain), item._id)) return fail(res, 'Complete the previous lesson before watching this video.', 403)
  if (videoUrl && !filename) {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
    return res.redirect(302, videoUrl)
  }
  res.set({ 'Content-Type': mediaTypes[filename.split('.').pop()], 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
  res.sendFile(storagePath(filename), { cacheControl: false, acceptRanges: true }, (error) => {
    if (!error) return
    if (res.headersSent) { res.destroy(); return }
    if (error.status === 404 || error.code === 'ENOENT') return fail(res, 'Media file is unavailable.', 404)
    if (error.status === 416) return res.status(416).end()
    next(error)
  })
}

function validDirectVideoUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /\.(mp4|webm|mov)$/i.test(url.pathname)
  } catch { return false }
}
