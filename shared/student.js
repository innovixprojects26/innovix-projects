import { internshipRoles, liveClasses } from '../src/data.js'

export const studentDomains = [...new Set([...internshipRoles, ...liveClasses.map((item) => item.name)])]
export const studyYears = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Final Year', 'Graduated', 'Other']
export const passwordHint = 'Use at least 10 characters, including uppercase, lowercase and a number (maximum 72 UTF-8 bytes).'
export function passwordError(password, confirmation) {
  if (typeof password !== 'string' || password.length < 10 || new TextEncoder().encode(password).length > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return passwordHint
  if (password !== confirmation) return 'Passwords do not match.'
  return ''
}
