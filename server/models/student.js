import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'
import { studentDomains, studyYears } from '../../shared/student.js'

const requiredText = (maxlength) => ({ type: String, required: true, trim: true, maxlength })
const schema = new mongoose.Schema({
  studentId: { type: String, unique: true, default: () => `INX-${randomBytes(8).toString('hex').toUpperCase()}` },
  fullName: requiredText(120),
  email: { ...requiredText(254), lowercase: true, unique: true },
  phone: requiredText(25), college: requiredText(180), course: requiredText(120),
  yearOfStudy: { ...requiredText(40), enum: studyYears },
  internshipDomain: { ...requiredText(100), enum: studentDomains },
  passwordHash: { type: String, required: true, select: false },
  accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },
  authVersion: { type: Number, default: 0, select: false },
  resetTokenHash: { type: String, select: false },
  resetExpiresAt: { type: Date, select: false },
}, { timestamps: true })
schema.set('toJSON', { transform: (_document, value) => { for (const field of ['passwordHash', 'authVersion', 'resetTokenHash', 'resetExpiresAt', '__v']) delete value[field]; return value } })
export const Student = mongoose.model('Student', schema)

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  authVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true })
export const StudentSession = mongoose.model('StudentSession', sessionSchema)

export function studentDto(student) {
  return Object.fromEntries(['studentId', 'fullName', 'email', 'phone', 'college', 'course', 'yearOfStudy', 'internshipDomain', 'accountStatus', 'createdAt'].map((field) => [field, student[field]]))
}
