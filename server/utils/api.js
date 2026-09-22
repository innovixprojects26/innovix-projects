export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function clean(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : value
}

export function validateEmail(value) {
  return typeof value === 'string' && emailPattern.test(value.trim())
}

export function validateUrl(value) {
  if (!value) return true
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

export function respond(res, data, status = 200) { return res.status(status).json({ success: status < 400, data }) }
export function fail(res, message, status = 400) { return res.status(status).json({ success: false, message }) }
