import { internshipRoles, liveClasses } from '../src/data.js'

const key = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '') : ''
const domains = [...new Set([...internshipRoles, ...liveClasses.map(item => item.name)])]
const names = new Map(domains.map(name => [key(name), name]))
for (const name of domains) names.set(key(name.replace(/[^a-z0-9]+/gi, '-')), name)
for (const [alias, name] of Object.entries({ 'Frontend Development': 'Frontend Developer', 'Python Development': 'Python Developer', 'UI/UX Design': 'UI/UX Designer' })) names.set(key(alias), name)

export const normalizeInternshipDomain = value => names.get(key(value)) || ''
export const sameInternshipDomain = (left, right) => Boolean(normalizeInternshipDomain(left)) && normalizeInternshipDomain(left) === normalizeInternshipDomain(right)
export const isEligibleBatch = (application, batch) => sameInternshipDomain(application.domain, batch.domain) && batch.enabled === true && ['Upcoming', 'Active'].includes(batch.status) && (batch.enrollmentCount ?? 0) < batch.maxStudents
export function validLiveClassUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
}
