const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Request failed')
  return payload.data
}

export async function submitPublic(path, body) { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }) }
export function getAdminToken() { return localStorage.getItem('innovix_admin_token') }
export function adminFetch(path, options = {}) { return apiFetch(`/admin${path}`, { ...options, headers: { Authorization: `Bearer ${getAdminToken()}`, ...(options.headers || {}) } }) }
export { API_BASE }
