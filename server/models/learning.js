import mongoose from 'mongoose'
import { batchStatuses, taskStatuses, submissionStatuses, certificateTypes } from '../../shared/learning.js'
const { Schema, model } = mongoose
const ref = (name, required = false) => ({ type: Schema.Types.ObjectId, ref: name, required, index: true })
const text = (max, required = false) => ({ type: String, trim: true, maxlength: max, required })
const batch = new Schema({ name: text(160, true), domain: text(100, true), code: { ...text(40, true), unique: true, uppercase: true }, startDate: { type: Date, required: true }, endDate: { type: Date, required: true }, duration: text(80), mentor: text(120, true), description: text(4000), maxStudents: { type: Number, min: 1, max: 10000, required: true }, enrollmentCount: { type: Number, default: 0, min: 0 }, applicationDeadline: Date, status: { type: String, enum: batchStatuses, default: 'Draft', index: true }, enabled: { type: Boolean, default: true }, requiredVideos: [ref('ContentCreationVideo')] }, { timestamps: true })
export const InternshipBatch = model('InternshipBatch', batch)
const enrollment = new Schema({ student: ref('Student', true), batch: ref('InternshipBatch', true), application: ref('InternshipApplication'), paymentStatus: { type: String, enum: ['Not Paid', 'Pending', 'Paid', 'NOT_PAID', 'PAID'], default: 'Not Paid' }, status: { type: String, enum: ['Enrolled', 'Completed', 'Removed', 'Transferred'], default: 'Enrolled' }, endedAt: Date }, { timestamps: true })
enrollment.add({ domain: String, month: Number, year: Number, enrolledAt: Date, learningAccessStatus: { type: String, enum: ['LOCKED', 'UNLOCKED'] }, paymentMode: { type: String, enum: ['test', 'live'] } })
enrollment.add({ testPayment: { type: new Schema({ status: { type: String, enum: ['Creating', 'Pending', 'Paid'] }, amount: Number, currency: { type: String, enum: ['INR'] }, orderId: String, paymentId: String, verifiedAt: Date }, { _id: false }), default: undefined } })
enrollment.add({ livePayment: { type: new Schema({
  status: { type: String, enum: ['Creating', 'Pending', 'Paid', 'Failed', 'PartiallyRefunded', 'Refunded'] },
  amount: { type: Number, min: 100 },
  currency: { type: String, enum: ['INR'] },
  orderId: String,
  paymentId: String,
  verifiedAt: Date,
  amountRefunded: { type: Number, min: 0 },
  reconciledAt: Date
}, { _id: false }), default: undefined } })
const offlinePayment = new Schema({
  accessSource: { type: String, enum: ['ADMIN_OFFLINE_PAYMENT'], required: true, immutable: true },
  status: { type: String, enum: ['Admin Verified'], required: true, immutable: true },
  amountPaise: { type: Number, min: 1, required: true, immutable: true },
  currency: { type: String, enum: ['INR'], required: true, immutable: true },
  method: { type: String, enum: ['UPI', 'Bank Transfer', 'Cash'], required: true, immutable: true },
  transactionReference: { type: String, trim: true, maxlength: 160, immutable: true },
  paymentDate: { type: Date, required: true, immutable: true },
  receiptNumber: { type: String, immutable: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
  internship: { type: Schema.Types.ObjectId, ref: 'InternshipDomain', required: true, immutable: true },
  studentName: { ...text(120, true), immutable: true },
  studentEmail: { ...text(254, true), immutable: true },
  internshipTitle: { ...text(120, true), immutable: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, immutable: true },
  approvedAdminEmail: { ...text(254, true), immutable: true },
  confirmedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { ...text(80, true), immutable: true },
  internalNote: { type: String, trim: true, maxlength: 1000, select: false, immutable: true }
}, { timestamps: true })
const offlineAccessGrant = new Schema({
  accessSource: { type: String, enum: ['ADMIN_OFFLINE_PAYMENT'], required: true },
  internship: { type: Schema.Types.ObjectId, ref: 'InternshipDomain', required: true },
  paymentRecordId: { type: Schema.Types.ObjectId, required: true },
  active: { type: Boolean, default: true, required: true },
  grantedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  grantedAt: { type: Date, required: true },
  revokedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  revokedAt: Date,
  revokeReason: { type: String, trim: true, maxlength: 500 }
}, { _id: false })
const customAdminPayment = new Schema({
  accessSource: { type: String, enum: ['ADMIN_CUSTOM_PAYMENT'], required: true, immutable: true },
  status: { type: String, enum: ['Pending', 'Admin Verified'], default: 'Pending' },
  agreedAmountPaise: { type: Number, min: 1, required: true, immutable: true },
  amountPaise: { type: Number, min: 1 },
  currency: { type: String, enum: ['INR'], default: 'INR', required: true, immutable: true },
  method: { type: String, enum: ['UPI', 'Bank Transfer', 'Cash'] },
  transactionReference: { type: String, trim: true, maxlength: 160 },
  paymentDate: Date,
  receiptNumber: String,
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
  internship: { type: Schema.Types.ObjectId, ref: 'InternshipDomain', required: true, immutable: true },
  domain: { ...text(100, true), immutable: true },
  studentName: { ...text(120, true), immutable: true },
  studentEmail: { ...text(254, true), immutable: true },
  internshipTitle: { ...text(120, true), immutable: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, immutable: true },
  approvedAdminEmail: { ...text(254, true), immutable: true },
  confirmedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  confirmedAdminEmail: { type: String, trim: true, maxlength: 254 },
  confirmedAt: Date,
  idempotencyKey: { ...text(80, true), immutable: true },
  internalNote: { type: String, trim: true, maxlength: 1000, select: false, immutable: true }
}, { timestamps: true })
const adminAccessGrant = new Schema({
  accessSource: { type: String, enum: ['ADMIN_FREE_ACCESS', 'ADMIN_CUSTOM_PAYMENT'], required: true, immutable: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
  internship: { type: Schema.Types.ObjectId, ref: 'InternshipDomain', required: true, immutable: true },
  domain: { ...text(100, true), immutable: true },
  active: { type: Boolean, default: true, required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, immutable: true },
  approvedAt: { type: Date, required: true, immutable: true },
  reason: { type: String, trim: true, maxlength: 500, immutable: true },
  customPaymentId: { type: Schema.Types.ObjectId, immutable: true },
  idempotencyKey: { ...text(80, true), immutable: true },
  revokedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  revokedAt: Date,
  revokeReason: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true })
const offlineAccessEvent = new Schema({
  action: { type: String, enum: ['OFFLINE_PAYMENT_CONFIRMED', 'ACCESS_GRANTED', 'RECEIPT_ISSUED', 'ACCESS_REVOKED', 'FREE_ACCESS_GRANTED', 'CUSTOM_PAYMENT_AGREEMENT_SAVED', 'CUSTOM_PAYMENT_CONFIRMED'], required: true, immutable: true },
  accessSource: { type: String, enum: ['ADMIN_OFFLINE_PAYMENT', 'ADMIN_FREE_ACCESS', 'ADMIN_CUSTOM_PAYMENT'], immutable: true },
  admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, immutable: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
  internship: { type: Schema.Types.ObjectId, ref: 'InternshipDomain', required: true, immutable: true },
  paymentRecordId: { type: Schema.Types.ObjectId, immutable: true },
  accessGrantId: { type: Schema.Types.ObjectId, immutable: true },
  amountPaise: { type: Number, min: 1, immutable: true },
  reason: { type: String, trim: true, maxlength: 500, immutable: true },
  occurredAt: { type: Date, default: Date.now, required: true, immutable: true }
}, { _id: false })
enrollment.add({
  offlinePayments: { type: [offlinePayment], default: undefined },
  offlineAccessGrant: { type: offlineAccessGrant, default: undefined },
  offlineAccessEvents: { type: [offlineAccessEvent], default: undefined },
  customAdminPayments: { type: [customAdminPayment], default: undefined },
  adminAccessGrants: { type: [adminAccessGrant], default: undefined }
})
enrollment.index({ student: 1, domain: 1 }, { unique: true, partialFilterExpression: { status: 'Enrolled' } })
enrollment.index({ student: 1, batch: 1, createdAt: -1 })
export const BatchEnrollment = model('BatchEnrollment', enrollment)
const task = new Schema({ stage: { type: String, enum: ['Task', 'Project'], default: 'Task' }, title: text(160, true), description: text(2000, true), instructions: text(8000), domain: text(100, true), scope: { type: String, enum: ['Domain', 'Batch', 'Student'], required: true }, batch: ref('InternshipBatch'), student: ref('Student'), assignedDate: { type: Date, required: true }, dueDate: { type: Date, required: true }, maximumMarks: { type: Number, min: 1, max: 10000 }, referenceUrl: text(2000), methods: { type: [String], default: ['text', 'github', 'demo', 'file'] }, required: { type: Boolean, default: true }, attachment: ref('LearningFile'), status: { type: String, enum: taskStatuses, default: 'Draft', index: true } }, { timestamps: true })
task.index({ domain: 1, status: 1, assignedDate: -1 })
export const InternshipTask = model('InternshipTask', task)
const revision = new Schema({ text: text(12000), github: text(2000), demo: text(2000), file: ref('LearningFile'), submittedAt: { type: Date, default: Date.now }, late: Boolean, feedback: text(4000), marks: Number, reviewedAt: Date, reviewStatus: { type: String, enum: submissionStatuses } }, { _id: true })
const submission = new Schema({ task: ref('InternshipTask', true), student: ref('Student', true), status: { type: String, enum: submissionStatuses, default: 'Submitted', index: true }, revisions: [revision], version: { type: Number, default: 1 } }, { timestamps: true })
submission.index({ task: 1, student: 1 }, { unique: true })
export const TaskSubmission = model('TaskSubmission', submission)
export const LearningFile = model('LearningFile', new Schema({ task: ref('InternshipTask', true), student: ref('Student'), filename: { ...text(60, true), select: false }, originalName: text(120, true), type: text(80, true), bytes: Number, purpose: { type: String, enum: ['attachment', 'submission'], required: true } }, { timestamps: true }))
const certificate = new Schema({ certificateId: { ...text(60, true), unique: true }, student: ref('Student', true), batch: ref('InternshipBatch', true), enrollment: ref('BatchEnrollment', true), studentId: text(60, true), studentName: text(120, true), domain: text(100, true), batchName: text(160, true), batchCode: text(40, true), type: { type: String, enum: certificateTypes, required: true }, startDate: Date, endDate: Date, duration: text(80), issueDate: { type: Date, default: Date.now }, status: { type: String, enum: ['Active', 'Revoked'], default: 'Active' }, revokedAt: Date }, { timestamps: true })
certificate.index({ student: 1, batch: 1, type: 1 }, { unique: true, partialFilterExpression: { status: 'Active' } })
export const Certificate = model('Certificate', certificate)
const notification = new Schema({ student: ref('Student', true), key: text(200, true), title: text(160, true), message: text(1000, true), href: text(200), readAt: Date }, { timestamps: true })
notification.index({ student: 1, key: 1 }, { unique: true }); notification.index({ student: 1, createdAt: -1 })
export const StudentNotification = model('StudentNotification', notification)
const activity = new Schema({ student: ref('Student', true), key: text(180, true), type: text(60, true), label: text(160, true), xp: { type: Number, default: 0 } }, { timestamps: true })
activity.index({ student: 1, key: 1 }, { unique: true })
export const LearningActivity = model('LearningActivity', activity)
const videoProgress = new Schema({ student: ref('Student', true), video: ref('ContentCreationVideo', true), position: Number, sampledAt: Date, ranges: { type: [[Number]], default: [] }, watchedSeconds: { type: Number, default: 0 }, completedAt: Date }, { timestamps: true })
videoProgress.index({ student: 1, video: 1 }, { unique: true })
export const VideoProgress = model('VideoProgress', videoProgress)
export async function initializeLearningModels() { await Promise.all([InternshipBatch, BatchEnrollment, InternshipTask, TaskSubmission, LearningFile, Certificate, StudentNotification, LearningActivity, VideoProgress].map(Model => Model.init())) }
