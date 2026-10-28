import { normalizeInternshipDomain } from '../shared/internship-domain.js'

let activeDomain = ''
export function selectInternship(student, location) {
  if (!student) { activeDomain = ''; return '' }
  const key = `innovix-selected-internship:${student.studentId || student._id}`
  let requested = new URLSearchParams(location.search).get('domain')
  if (location.pathname.startsWith('/internships/')) {
    try { requested = decodeURIComponent(location.pathname.slice('/internships/'.length)) } catch { /* Invalid route. */ }
  }
  let saved = ''
  try { saved = sessionStorage.getItem(key) } catch { /* Storage is optional. */ }
  activeDomain = normalizeInternshipDomain(requested) || normalizeInternshipDomain(saved) || student.internshipDomain
  try { sessionStorage.setItem(key, activeDomain) } catch { /* Storage is optional. */ }
  return activeDomain
}

export function withSelectedInternship(path) {
  if (!activeDomain) return path
  const [pathname, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  if (!params.has('domain')) params.set('domain', activeDomain)
  return `${pathname}?${params}`
}
