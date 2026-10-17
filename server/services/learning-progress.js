
import { learningStages } from './learning-stages.js'
import { paymentAllowsLearning } from './monthly-enrollment.js'
import { getDomain, getConfig } from '../models/management.js'
import {
  BatchEnrollment,
  InternshipTask,
  TaskSubmission,
  VideoProgress,
  LearningActivity,
  Certificate
} from '../models/learning.js'
import { DiscoverRead } from '../models/discover.js'
import {
  taskQuery,
  problem,
  studentHasDomainAccess
} from './learning-access.js'
import { batchProgress } from '../../shared/learning.js'

const verifiedTestPayment = enrollment => Boolean(
  enrollment?.testPayment?.status === 'Paid' &&
  enrollment?.testPayment?.paymentId &&
  enrollment?.testPayment?.verifiedAt
)

function verifiedCertificatePayment(enrollment) {
  if (!paymentAllowsLearning(enrollment)) return false
  const live = enrollment.paymentMode === 'live'
  if (live ? enrollment.testPayment : enrollment.livePayment) return false
  if (!live && enrollment.paymentMode != null && enrollment.paymentMode !== 'test') return false
  if (enrollment.paymentMode === 'test' && !['Paid', 'PAID'].includes(enrollment.paymentStatus)) return false
  const payment = live ? enrollment.livePayment : enrollment.testPayment
  return Boolean(
    payment?.status === 'Paid' &&
    (live || verifiedTestPayment(enrollment)) &&
    typeof payment.orderId === 'string' && /^order_[a-zA-Z0-9]+$/.test(payment.orderId) &&
    typeof payment.paymentId === 'string' && /^pay_[a-zA-Z0-9]+$/.test(payment.paymentId) &&
    (payment.verifiedAt instanceof Date || typeof payment.verifiedAt === 'string') &&
    Number.isFinite(new Date(payment.verifiedAt).getTime()) &&
    Number.isSafeInteger(payment.amount) && payment.amount >= 100 && payment.currency === 'INR' &&
    (payment.amount_refunded == null || payment.amount_refunded === 0)
  )
}

export async function eligibility(student, enrollment) {
  if (
    !enrollment ||
    String(enrollment.student) !== String(student._id) ||
    !enrollment.batch
  ) {
    throw problem('Enrollment not found.', 404)
  }

  const batch = enrollment.batch
  const stages = await learningStages(student, enrollment)
  const reasons = []

  if (
    batch.status !== 'Completed' ||
    enrollment.status !== 'Completed'
  ) {
    reasons.push(
      'Batch must be completed with a completed enrollment.'
    )
  }

  if (!stages.videosDone) {
    reasons.push(
      'Complete all required recorded lessons; Admin must configure lessons if none are assigned.'
    )
  }

  if (!stages.tasksDone) {
    reasons.push(
      'All required tasks must be approved; Admin must assign tasks if none are configured.'
    )
  }

  if (!stages.projectsDone) {
    reasons.push(
      'A required final project must be uploaded and approved by Admin.'
    )
  }

  // Payment must be verified before certificate eligibility.
  if (!verifiedCertificatePayment(enrollment)) {
    reasons.push(
      'Complete and verify your internship payment.'
    )
  }

  return {
    ...stages,
    eligible: !reasons.length,
    reasons
  }
}

export async function learningProgress(student) {
  const { settings } = await getConfig()

  const enrollments = settings.batchesEnabled
    ? await BatchEnrollment.find({
        student: student._id
      })
        .populate('batch')
        .sort({ createdAt: -1 })
        .lean()
    : []

  const current =
    enrollments.find(item => item.status === 'Enrolled') ||
    enrollments.find(item => item.status === 'Completed')

  const domain = await getDomain(student.internshipDomain)

  // This checks the verified TEST payment and valid enrollment.
  const hasLearningAccess = await studentHasDomainAccess(student)

  const tasks = settings.tasksEnabled
    ? await InternshipTask.find(
        await taskQuery(student)
      )
        .sort({ dueDate: 1 })
        .lean()
    : []

  const submissions = await TaskSubmission.find({
    student: student._id,
    task: {
      $in: tasks.map(item => item._id)
    }
  }).lean()

  const completed = submissions.filter(item =>
    ['Approved', 'Completed'].includes(item.status)
  ).length

  const completedIds = new Set(
    submissions
      .filter(item =>
        ['Approved', 'Completed'].includes(item.status)
      )
      .map(item => String(item.task))
  )

  const stages = await learningStages(student)

  const upcoming = hasLearningAccess
    ? tasks
        .filter(item =>
          stages.videosDone &&
          (
            item.stage !== 'Project' ||
            stages.tasksDone
          ) &&
          item.status === 'Published' &&
          !completedIds.has(String(item._id))
        )
        .slice(0, 5)
    : []

  const [
    videos,
    discoveries,
    activity,
    certificates
  ] = await Promise.all([
    VideoProgress.countDocuments({
      student: student._id,
      completedAt: { $ne: null }
    }),

    DiscoverRead.countDocuments({
      student: student._id
    }),

    LearningActivity.find({
      student: student._id
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),

    settings.certificateVerificationEnabled
      ? Certificate.find({
          student: student._id
        })
          .select('-student -__v')
          .sort({ issueDate: -1 })
          .lean()
      : []
  ])

  if (
    stages.projectsDone &&
    certificates.some(item =>
      item.status === 'Active' &&
      String(item.enrollment) === String(current?._id)
    )
  ) {
    stages.steps[3].status = 'Completed'
    stages.steps[3].message =
      'Admin has issued your certificate.'
  }

  const testPaid = verifiedTestPayment(current)

  // TEST payment and real payment are kept separate.
  const payment = {
    fee: domain?.price ?? 499,
    status: testPaid
      ? 'Paid'
      : current?.testPayment?.status === 'Paid'
        ? 'Not Paid'
        : current?.testPayment?.status || 'Not Paid',
    featureEnabled: settings.internshipPaymentsEnabled,
    gatewayEnabled: false,
    testMode: true,
    verified: testPaid,
    accessUnlocked: hasLearningAccess,
    realPaymentStatus: current?.paymentStatus || 'Not Paid'
  }

  return {
    stages,
    payment,
    enrollment: current || null,
    history: enrollments,
    internshipProgress: current?.batch
      ? batchProgress(current.batch)
      : null,
    tasksAssigned: tasks.length,
    tasksCompleted: completed,
    tasksPending: tasks.length - completed,
    videosWatched: videos,
    discoveriesRead: discoveries,
    upcoming,
    activity,
    certificates,
    eligibility:
      current && settings.certificateVerificationEnabled
        ? await eligibility(student, current)
        : null
  }
}
