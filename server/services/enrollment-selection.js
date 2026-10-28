import { BatchEnrollment } from '../models/learning.js'
import { sameInternshipDomain } from '../../shared/internship-domain.js'

// Batch is authoritative for historical records lacking a denormalized domain.
export function matchesEnrollmentDomain(enrollment, domain) {
  return sameInternshipDomain(enrollment?.batch?.domain, domain) &&
    (!enrollment.domain || sameInternshipDomain(enrollment.domain, domain))
}

export async function selectedEnrollment(student) {
  const items = await BatchEnrollment.find({
    student: student._id, status: { $in: ['Enrolled', 'Completed'] }
  }).sort({ createdAt: -1, _id: -1 }).populate('batch').lean()
  const matching = items.filter(item => matchesEnrollmentDomain(item, student.internshipDomain))
  return matching.find(item => item.status === 'Enrolled') || matching[0] || null
}

export async function domainPaymentEnrollment(student, domain, filter) {
  const items = await BatchEnrollment.find({ ...filter, student: student._id })
    .sort({ createdAt: -1, _id: -1 }).populate('batch').lean()
  return items.find(item => matchesEnrollmentDomain(item, domain)) || null
}
