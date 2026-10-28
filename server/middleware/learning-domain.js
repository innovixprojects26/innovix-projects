import { normalizeInternshipDomain } from '../../shared/internship-domain.js'

// Request-local projection only: never change the student's registered profile.
// Selecting a domain does not authorize access; enrollment/payment gates still apply.
export function selectLearningDomain(req, _res, next) {
  const requested = req.query?.domain
  if (requested !== undefined) {
    const domain = normalizeInternshipDomain(requested)
    if (!domain) throw Object.assign(new Error('Select a valid internship domain.'), { status: 400 })
    req.student = { ...(req.student.toObject?.() || req.student), internshipDomain: domain }
  }
  next?.()
}
