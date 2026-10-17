import { normalizeInternshipDomain, sameInternshipDomain } from '../../shared/internship-domain.js'
import { indiaMonth, paidEnrollment, paymentAllowsLearning } from '../services/monthly-enrollment.js'

import {
  VideoProgress,
  LearningActivity,
  BatchEnrollment
} from '../models/learning.js'

import { ContentVideo } from '../models/content-video.js'
import { Student } from '../models/student.js'

import {
  recordingEnabled,
  getConfig,
  InternshipDomain
} from '../models/management.js'

import { learningProgress } from '../services/learning-progress.js'
import { videoSequence } from '../services/learning-stages.js'
import { recordActivity } from '../services/learning-activity.js'

import {
  problem,
  studentHasDomainAccess
} from '../services/learning-access.js'

import { respond } from '../utils/api.js'

// STUDENT LEARNING PROGRESS
// Keep this endpoint accessible before payment so students
// can view their enrollment and payment information.
export async function progress(req, res) {
  await recordActivity(
    req.student._id,
    'login',
    'first-login',
    'First Login',
    10
  )

  return respond(
    res,
    await learningProgress(req.student)
  )
}

// MERGE VIDEO WATCHED RANGES
export function mergeRanges(ranges) {
  const result = []

  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    if (result.length && start <= result.at(-1)[1]) {
      result.at(-1)[1] = Math.max(result.at(-1)[1], end)
    } else {
      result.push([start, end])
    }
  }

  return result
}

// RECORDED VIDEO PROGRESS
export async function videoActivity(req, res) {
  const domain = normalizeInternshipDomain(req.student.internshipDomain)

  // Verified Razorpay TEST payment is required.
  if (!await studentHasDomainAccess(req.student)) {
    throw problem(
      'Complete and verify your internship payment to access recorded classes.',
      403
    )
  }

  if (!await recordingEnabled(domain)) {
    throw problem('Recorded class unavailable.', 404)
  }

  const domainFilter = domain === 'Content Creation'
    ? {
        $or: [
          { domain },
          { domain: { $exists: false } }
        ]
      }
    : { domain }

  const video = await ContentVideo.findOne({
    _id: req.params.id,
    $and: [
      domainFilter,
      {
        status: 'published',
        publishDate: { $lte: new Date() }
      },
      {
        $or: [
          {
            videoFile: {
              $exists: true,
              $ne: null
            }
          },
          {
            videoUrl: {
              $exists: true,
              $ne: ''
            }
          }
        ]
      }
    ]
  }).lean()

  if (!video) {
    throw problem('Recorded class unavailable.', 404)
  }

  // Preserve the existing lesson progression system.
  if (
    videoSequenceLocked(
      await videoSequence(req.student, domain),
      video._id
    )
  ) {
    throw problem(
      'Complete the previous lesson before watching this video.',
      403
    )
  }

  const position = req.body.position

  if (
    !Number.isFinite(position) ||
    position < 0 ||
    position > (video.duration || 86400) + 2
  ) {
    throw problem('Invalid playback position.')
  }

  const now = new Date()

  const query = {
    student: req.student._id,
    video: video._id
  }

  let item = await VideoProgress.findOne(query)

  if (!item) {
    item = await VideoProgress.create({
      ...query,
      position,
      sampledAt: now
    })

    return respond(res, {
      watchedSeconds: 0,
      completed: false
    })
  }

  const elapsed = (now - item.sampledAt) / 1000
  const delta = position - item.position

  const ranges = item.ranges.map(range => [...range])

  // Only continuous forward playback matching elapsed
  // server time earns learning credit.
  if (
    elapsed > 0 &&
    elapsed <= 30 &&
    delta > 0 &&
    delta <= elapsed * 1.5 + 1 &&
    delta <= 30
  ) {
    ranges.push([
      item.position,
      Math.min(position, item.position + elapsed)
    ])
  }

  const merged = mergeRanges(ranges).slice(0, 5000)

  const watchedSeconds = merged.reduce(
    (sum, [start, end]) => sum + end - start,
    0
  )

  const completedAt =
    item.completedAt ||
    (
      video.duration > 0 &&
      watchedSeconds >= video.duration * 0.9
        ? now
        : undefined
    )

  const updated = await VideoProgress.findOneAndUpdate(
    {
      _id: item._id,
      sampledAt: item.sampledAt
    },
    {
      $set: {
        position,
        sampledAt: now,
        ranges: merged,
        watchedSeconds,
        ...(completedAt ? { completedAt } : {})
      }
    },
    {
      returnDocument: 'after'
    }
  )

  if (!updated) {
    throw problem(
      'Playback progress changed. The next update will retry.',
      409
    )
  }

  if (watchedSeconds > item.watchedSeconds) {
    await recordActivity(
      req.student._id,
      'learning-day',
      `learning-day:${now.toISOString().slice(0, 10)}`,
      'Recorded class learning',
      2
    )
  }

  if (completedAt) {
    await recordActivity(
      req.student._id,
      'video-completed',
      `video:${video._id}`,
      `Completed video: ${video.title}`,
      30
    )
  }

  return respond(res, {
    watchedSeconds,
    completed: Boolean(completedAt)
  })
}

const videoSequenceLocked = (sequence, videoId) =>
  sequence.get(String(videoId))?.locked ?? true

// ADMIN PAYMENT HISTORY
// Keep real payment and Razorpay TEST payment clearly separate.
export async function paymentRecords(_req, res) {
  const [enrollments, domains] = await Promise.all([
    BatchEnrollment.find()
      .populate('student', 'studentId fullName email')
      .populate('batch', 'name code domain enabled status')
      .sort({ createdAt: -1 })
      .lean(),

    InternshipDomain.find()
      .select('name price active')
      .lean()
  ])

  const prices = new Map(
    domains.map(item => [item.name, item.price])
  )

  const internships = enrollments.map(item => {
      const verifiedTestPayment = Boolean(
        item.testPayment?.status === 'Paid' &&
        item.testPayment?.paymentId &&
        item.testPayment?.verifiedAt
      )

      const testStatus = verifiedTestPayment
        ? 'Paid'
        : item.testPayment?.status === 'Paid'
          ? 'Unverified'
          : item.testPayment?.status

      const status = testStatus
        ? `${item.paymentStatus || 'Not Paid'} (TEST: ${testStatus})`
        : item.paymentStatus || 'Not Paid'

      return {
        _id: item._id,
        student: item.student,
        batch: item.batch,
        fee: item.testPayment?.amount != null
          ? item.testPayment.amount / 100
          : prices.get(item.batch?.domain),
        status,
        paymentStatus: paidEnrollment(item) ? 'PAID' : 'NOT_PAID',
        ...(item.month && item.year ? { month: item.month, year: item.year } : indiaMonth(item.enrolledAt || item.createdAt)),
        domain: item.domain || item.batch?.domain,
        learningAccessStatus: paymentAllowsLearning(item) && ['Enrolled', 'Completed'].includes(item.status) && item.batch?.enabled && !['Draft', 'Cancelled'].includes(item.batch?.status) && domains.some(domain => domain.active && sameInternshipDomain(domain.name, item.batch?.domain) && domain.name !== 'AI Tools') ? 'UNLOCKED' : 'LOCKED',
        paymentMode: item.testPayment?.verifiedAt ? 'TEST' : 'Historical',
        paymentDate: item.testPayment?.verifiedAt,
        transactionReference: item.testPayment?.paymentId,
        testPayment: item.testPayment,
        enrollmentStatus: item.status,
        createdAt: item.enrolledAt || item.createdAt
      }
    })
  const q = _req.query || {}
  const search = String(q.search || '').trim().toLowerCase()
  const filtered = internships.filter(item => (!q.month || item.month === Number(q.month)) && (!q.year || item.year === Number(q.year)) && (!q.domain || item.domain === q.domain) && (!q.paymentStatus || item.paymentStatus === q.paymentStatus) && (!search || `${item.student?.fullName || ''} ${item.student?.email || ''}`.toLowerCase().includes(search)))
  const counts = key => Object.entries(filtered.reduce((all, item) => { const value = key(item); all[value] = (all[value] || 0) + 1; return all }, {})).map(([name, count]) => ({ name, count }))
  return respond(res, { internships: filtered, projects: [], summary: { total: filtered.length, paid: filtered.filter(item => item.paymentStatus === 'PAID').length, notPaid: filtered.filter(item => item.paymentStatus === 'NOT_PAID').length, monthly: counts(item => `${item.year}-${String(item.month).padStart(2, '0')}`), domains: counts(item => item.domain || 'Unknown') }, options: { domains: [...new Set(internships.map(item => item.domain).filter(Boolean))].sort(), years: [...new Set(internships.map(item => item.year))].sort((a,b) => b-a) } })
}

// ACHIEVEMENTS
export function achievements(events, now = new Date()) {
  const count = type =>
    events.filter(event => event.type === type).length

  const dates = new Set(
    events
      .filter(event => event.type !== 'login')
      .map(event =>
        new Date(event.createdAt).toISOString().slice(0, 10)
      )
  )

  const cursor = new Date(now)
  cursor.setUTCHours(0, 0, 0, 0)

  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  let streak = 0

  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  const badges = [
    count('login') && 'First Login',
    count('video-completed') && 'First Video Completed',
    count('task-submitted') && 'First Task Submitted',
    count('task-completed') >= 5 && 'Task Master',
    streak >= 7 && '7-Day Learner',
    count('discovery-read') >= 5 && 'Learning Explorer',
    count('internship-completed') && 'Internship Completed'
  ].filter(Boolean)

  return {
    xp: events.reduce(
      (sum, event) => sum + event.xp,
      0
    ),
    badges,
    streak
  }
}

// STUDENT GAMIFICATION
export async function gamification(req, res) {
  const events = await LearningActivity.find({
    student: req.student._id,
    xp: { $gt: 0 }
  }).lean()

  return respond(res, {
    ...achievements(events),
    leaderboardExcluded: Boolean(
      req.student.leaderboardExcluded
    )
  })
}

// LEADERBOARD
export async function leaderboard(_req, res) {
  const { settings } = await getConfig()

  if (
    !settings.gamificationEnabled ||
    !settings.leaderboardEnabled
  ) {
    throw problem(
      'Leaderboard is currently unavailable.',
      404
    )
  }

  const items = await LearningActivity.aggregate([
    {
      $group: {
        _id: '$student',
        xp: { $sum: '$xp' }
      }
    },
    {
      $match: {
        xp: { $gt: 0 }
      }
    },
    {
      $lookup: {
        from: Student.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    {
      $unwind: '$student'
    },
    {
      $match: {
        'student.accountStatus': 'active',
        'student.leaderboardExcluded': {
          $ne: true
        }
      }
    },
    {
      $sort: {
        xp: -1,
        _id: 1
      }
    },
    {
      $limit: 20
    },
    {
      $project: {
        _id: 0,
        studentId: '$student.studentId',
        xp: 1
      }
    }
  ])

  return respond(res, items)
}

// LEADERBOARD PRIVACY PREFERENCE
export async function leaderboardPreference(req, res) {
  if (typeof req.body.excluded !== 'boolean') {
    throw problem('Choose a valid privacy preference.')
  }

  await Student.updateOne(
    { _id: req.student._id },
    {
      $set: {
        leaderboardExcluded: req.body.excluded
      }
    }
  )

  return respond(res, {
    excluded: req.body.excluded
  })
}
