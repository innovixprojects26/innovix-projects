import { API_BASE } from './api'

export function safeStudentReturnTo(value) {
  return typeof value === 'string' && /^\/student(?:\/(?:internship|recorded-classes|tasks|certificates))?(?:[?#].*)?$/.test(value) ? value : '/student'
}
export async function studentFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include', cache: 'no-store', signal: options.signal || AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success === false) {
    if (response.status === 401 && !['/student/login', '/student/me'].includes(path)) window.dispatchEvent(new Event('student-session-ended'))
    throw Object.assign(new Error(payload.message || 'The student service is unavailable. Please try again.'), { status: response.status })
  }
  return payload.data
}
