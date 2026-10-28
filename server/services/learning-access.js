import { selectedEnrollment, matchesEnrollmentDomain } from './enrollment-selection.js'
import { paymentAllowsLearning } from './monthly-enrollment.js'

import mongoose from 'mongoose'
import { requireLearningStage } from './learning-stages.js'
import { sameInternshipDomain } from '../../shared/internship-domain.js'
import { getConfig, getDomain } from '../models/management.js'
import { InternshipApplication } from '../models/index.js'
import { InternshipTask } from '../models/learning.js'

export const problem = (message, status = 400) =>
  Object.assign(new Error(message), { status })

export const id = value => mongoose.isObjectIdOrHexString(value)

export async function feature(name) {
  if (!(await getConfig()).settings[name]) {
    throw problem('This feature is currently unavailable.', 404)
  }
}

// Payment verification is compulsory for learning access.
export async function studentHasDomainAccess(student, suppliedEnrollment) {
  if (!(await getConfig()).settings.batchesEnabled) return false
  const enrollment = suppliedEnrollment || await selectedEnrollment(student)
  const domain = await getDomain(enrollment?.batch?.domain || student.internshipDomain)

  // Temporarily disable AI Tools learning access.
  if (!domain?.active || domain.name === 'AI Tools') {
    return false
  }

  if (!enrollment?.batch) {
    return false
  }

  const validEnrollment = Boolean(
    String(enrollment.student) === String(student._id) &&
    ['Enrolled', 'Completed'].includes(enrollment.status) &&
    enrollment.batch.enabled &&
    matchesEnrollmentDomain(enrollment, domain.name) &&
    !['Draft', 'Cancelled'].includes(enrollment.batch.status)
  )

  // Payment status must have been set by the server-side
  // Razorpay TEST verification process.
  const paymentVerified = paymentAllowsLearning(enrollment)

  return validEnrollment && paymentVerified
}

// Keep this function for application approval/status checks.
// Approval alone must not unlock learning access.
export async function studentHasApprovedApplication(student) {
  if (!student.email) return false

  const applications = await InternshipApplication.find({
    email: student.email,
    status: { $in: ['Approved', 'Joined', 'Completed'] }
  })
    .select('domain')
    .lean()

  return applications.some(application =>
    sameInternshipDomain(
      application.domain,
      student.internshipDomain
    )
  )
}

export async function taskQuery(
  student,
  { batchId, includeClosed = true } = {}
) {
  if (!await studentHasDomainAccess(student)) {
    return { _id: { $exists: false } }
  }

  const current = await selectedEnrollment(student)
  if (batchId && String(current?.batch?._id) !== String(batchId)) return { _id: { $exists: false } }
  const batches = current?.batch ? [current.batch._id] : []

  const names = (await InternshipTask.distinct('domain'))
    .filter(name =>
      sameInternshipDomain(
        name,
        student.internshipDomain
      )
    )

  return {
    domain: { $in: names },
    status: {
      $in: includeClosed
        ? ['Published', 'Closed']
        : ['Published']
    },
    assignedDate: { $lte: new Date() },
    $or: [
      { scope: 'Domain' },
      { scope: 'Student', student: student._id },
      { scope: 'Batch', batch: { $in: batches } }
    ]
  }
}

export async function accessibleTask(student, taskId) {
  if (!id(taskId)) {
    throw problem('Task not found.', 404)
  }

  const item = await InternshipTask.findOne({
    _id: taskId,
    ...await taskQuery(student)
  }).lean()

  if (!item) {
    throw problem('Task not found.', 404)
  }

  await requireLearningStage(student, item)

  return item
}

export function learningError(error, _req, res, _next) {
  const status =
    error.status ||
    (
      error.code === 11000
        ? 409
        : error.name === 'ValidationError' ||
          error.name === 'CastError'
          ? 400
          : 500
    )

  res.status(status).json({
    success: false,
    message: error.status
      ? error.message
      : status === 409
        ? 'This record already exists or was changed. Refresh and try again.'
        : status === 400
          ? 'Check the supplied fields and try again.'
          : 'The learning service is temporarily unavailable. Please try again.'
  })
}
