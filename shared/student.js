import { internshipRoles, liveClasses } from '../src/data.js'

export const studentDomains = [...new Set([...internshipRoles, ...liveClasses.map((item) => item.name)])]
export const studyYears = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Final Year', 'Graduated', 'Other']
export { passwordError, passwordHint } from './student-password.js'
