import { randomBytes } from 'node:crypto'
import { Certificate, BatchEnrollment } from '../models/learning.js'
import { Student } from '../models/student.js'
import { eligibility } from '../services/learning-progress.js'
import { problem, id } from '../services/learning-access.js'
import { respond } from '../utils/api.js'
import { certificateTypes } from '../../shared/learning.js'
import { notifyStudent } from '../services/learning-notifications.js'

export const publicCertificate = item => Object.fromEntries(['certificateId', 'studentName', 'type', 'domain', 'batchName', 'duration', 'issueDate', 'status'].map(key => [key, item[key]]))
export async function certificates(_req, res) { return respond(res, await Certificate.find().sort({ issueDate: -1 }).limit(500).lean()) }
export async function certificateEligibility(req, res) {
  const enrollment = await BatchEnrollment.findById(req.params.id).populate('batch').lean()
  if (!enrollment) throw problem('Enrollment not found.', 404)
  const student = await Student.findById(enrollment.student)
  if (!student) throw problem('Student not found.', 404)
  return respond(res, await eligibility(student, enrollment))
}
export async function issueCertificate(req, res) {
  if (!id(req.body.enrollment) || !certificateTypes.includes(req.body.type)) throw problem('Choose an enrollment and certificate type.')
  const enrollment = await BatchEnrollment.findById(req.body.enrollment).populate('batch').lean()
  if (!enrollment) throw problem('Enrollment not found.', 404)
  const student = await Student.findById(enrollment.student)
  if (!student) throw problem('Student not found.', 404)
  const result = await eligibility(student, enrollment)
  if (!result.eligible) throw problem(result.reasons.join(' '), 409)
  const batch = enrollment.batch
  const certificateId = `INX-INT-${new Date().getUTCFullYear()}-${randomBytes(8).toString('hex').toUpperCase()}`
  const item = await Certificate.create({ certificateId, student: student._id, batch: batch._id, enrollment: enrollment._id, studentId: student.studentId, studentName: student.fullName, domain: batch.domain, batchName: batch.name, batchCode: batch.code, type: req.body.type, startDate: batch.startDate, endDate: batch.endDate, duration: batch.duration || `${Math.ceil((batch.endDate - batch.startDate) / 86400000)} days` })
  await notifyStudent(student._id, `certificate:${item._id}:Active`, 'Certificate Issued', `${item.type}: ${item.certificateId}`, '/student/certificates')
  return respond(res, item, 201)
}
export async function revokeCertificate(req, res) {
  const item = await Certificate.findOneAndUpdate({ _id: req.params.id, status: 'Active' }, { $set: { status: 'Revoked', revokedAt: new Date() } }, { returnDocument: 'after' })
  if (!item) throw problem('Active certificate not found.', 404)
  await notifyStudent(item.student, `certificate:${item._id}:Revoked`, 'Certificate Revoked', `${item.type}: ${item.certificateId}`, '/student/certificates')
  return respond(res, item)
}
export async function verifyCertificate(req, res) {
  if (!/^INX-INT-\d{4}-[A-F\d]{16}$/.test(req.params.certificateId || '')) throw problem('Certificate Not Found', 404)
  const item = await Certificate.findOne({ certificateId: req.params.certificateId }).lean()
  if (!item) throw problem('Certificate Not Found', 404)
  return respond(res, publicCertificate(item))
}
