import { InternshipApplication } from '../models/index.js'
import { BatchEnrollment, InternshipBatch } from '../models/learning.js'
import { Student } from '../models/student.js'
import { normalizeInternshipDomain } from '../../shared/internship-domain.js'

export async function internshipIndicators() {
  const [approved, enrolled] = await Promise.all([
    InternshipApplication.aggregate([
      { $match: { status: { $in: ['Approved', 'Joined', 'Completed'] } } },
      { $group: { _id: { domain: '$domain', email: '$email' } } },
      { $project: { _id: 0, domain: '$_id.domain', email: '$_id.email' } },
    ]),
    BatchEnrollment.aggregate([
      { $match: { status: { $in: ['Enrolled', 'Completed'] } } },
      { $lookup: { from: InternshipBatch.collection.name, localField: 'batch', foreignField: '_id', as: 'batch' } },
      { $unwind: '$batch' },
      { $lookup: { from: Student.collection.name, localField: 'student', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      { $project: { _id: 0, domain: '$batch.domain', email: '$student.email' } },
    ]),
  ])
  const students = new Map()
  for (const row of [...approved, ...enrolled]) {
    const domain = normalizeInternshipDomain(row.domain)
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
    if (!domain || !email) continue
    if (!students.has(domain)) students.set(domain, new Set())
    students.get(domain).add(email)
  }
  // Current schemas have no numerical internship rating or domain-linked review.
  return Object.fromEntries([...students].map(([domain, identities]) => [domain, { enrollmentCount: identities.size }]))
}
