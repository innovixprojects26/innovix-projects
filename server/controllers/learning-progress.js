import { VideoProgress, LearningActivity } from '../models/learning.js'
import { ContentVideo } from '../models/content-video.js'
import { Student } from '../models/student.js'
import { recordingEnabled, getConfig } from '../models/management.js'
import { learningProgress } from '../services/learning-progress.js'
import { recordActivity } from '../services/learning-activity.js'
import { problem } from '../services/learning-access.js'
import { respond } from '../utils/api.js'

export async function progress(req, res) {
  await recordActivity(req.student._id, 'login', 'first-login', 'First Login', 10)
  return respond(res, await learningProgress(req.student))
}
export function mergeRanges(ranges) {
  const result = []
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    if (result.length && start <= result.at(-1)[1]) result.at(-1)[1] = Math.max(result.at(-1)[1], end)
    else result.push([start, end])
  }
  return result
}
export async function videoActivity(req, res) {
  if (req.student.internshipDomain !== 'Content Creation' || !await recordingEnabled()) throw problem('Recorded class unavailable.', 404)
  const video = await ContentVideo.findOne({ _id: req.params.id, status: 'published', publishDate: { $lte: new Date() }, videoFile: { $exists: true } }).lean()
  if (!video) throw problem('Recorded class unavailable.', 404)
  const position = req.body.position
  if (!Number.isFinite(position) || position < 0 || position > (video.duration || 86400) + 2) throw problem('Invalid playback position.')
  const now = new Date(), query = { student: req.student._id, video: video._id }
  let item = await VideoProgress.findOne(query)
  if (!item) { item = await VideoProgress.create({ ...query, position, sampledAt: now }); return respond(res, { watchedSeconds: 0, completed: false }) }
  const elapsed = (now - item.sampledAt) / 1000, delta = position - item.position
  const ranges = item.ranges.map(range => [...range])
  // Only contiguous, forward playback consistent with elapsed server time earns credit.
  if (elapsed > 0 && elapsed <= 30 && delta > 0 && delta <= elapsed * 1.5 + 1 && delta <= 30) ranges.push([item.position, Math.min(position, item.position + elapsed)])
  const merged = mergeRanges(ranges).slice(0, 5000)
  const watchedSeconds = merged.reduce((sum, [start, end]) => sum + end - start, 0)
  const completedAt = item.completedAt || (video.duration > 0 && watchedSeconds >= video.duration * .9 ? now : undefined)
  const updated = await VideoProgress.findOneAndUpdate({ _id: item._id, sampledAt: item.sampledAt }, { $set: { position, sampledAt: now, ranges: merged, watchedSeconds, ...(completedAt ? { completedAt } : {}) } }, { returnDocument: 'after' })
  if (!updated) throw problem('Playback progress changed. The next update will retry.', 409)
  if (watchedSeconds > item.watchedSeconds) await recordActivity(req.student._id, 'learning-day', `learning-day:${now.toISOString().slice(0, 10)}`, 'Recorded class learning', 2)
  if (completedAt) await recordActivity(req.student._id, 'video-completed', `video:${video._id}`, `Completed video: ${video.title}`, 30)
  return respond(res, { watchedSeconds, completed: Boolean(completedAt) })
}
export function achievements(events, now = new Date()) {
  const count = type => events.filter(event => event.type === type).length
  const dates = new Set(events.filter(event => event.type !== 'login').map(event => new Date(event.createdAt).toISOString().slice(0, 10)))
  const cursor = new Date(now); cursor.setUTCHours(0, 0, 0, 0)
  if (!dates.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let streak = 0
  while (dates.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1) }
  const badges = [count('login') && 'First Login', count('video-completed') && 'First Video Completed', count('task-submitted') && 'First Task Submitted', count('task-completed') >= 5 && 'Task Master', streak >= 7 && '7-Day Learner', count('discovery-read') >= 5 && 'Learning Explorer', count('internship-completed') && 'Internship Completed'].filter(Boolean)
  return { xp: events.reduce((sum, event) => sum + event.xp, 0), badges, streak }
}
export async function gamification(req, res) {
  const events = await LearningActivity.find({ student: req.student._id, xp: { $gt: 0 } }).lean()
  return respond(res, { ...achievements(events), leaderboardExcluded: Boolean(req.student.leaderboardExcluded) })
}
export async function leaderboard(_req, res) {
  const { settings } = await getConfig()
  if (!settings.gamificationEnabled || !settings.leaderboardEnabled) throw problem('Leaderboard is currently unavailable.', 404)
  const items = await LearningActivity.aggregate([{ $group: { _id: '$student', xp: { $sum: '$xp' } } }, { $match: { xp: { $gt: 0 } } }, { $lookup: { from: Student.collection.name, localField: '_id', foreignField: '_id', as: 'student' } }, { $unwind: '$student' }, { $match: { 'student.accountStatus': 'active', 'student.leaderboardExcluded': { $ne: true } } }, { $sort: { xp: -1, _id: 1 } }, { $limit: 20 }, { $project: { _id: 0, studentId: '$student.studentId', xp: 1 } }])
  return respond(res, items)
}
export async function leaderboardPreference(req, res) {
  if (typeof req.body.excluded !== 'boolean') throw problem('Choose a valid privacy preference.')
  await Student.updateOne({ _id: req.student._id }, { $set: { leaderboardExcluded: req.body.excluded } })
  return respond(res, { excluded: req.body.excluded })
}
