import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from './api'
import { studentFetch } from './student-api'

export const dateLabel = value => value ? new Date(value).toLocaleDateString() : '—'
export function useLearning(path, admin = false) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: '' })
  const [version, setVersion] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const requestKey = `${admin}:${path}:${version}`
  useEffect(() => {
    if (!path) return
    let active = true
    const fetcher = admin ? adminFetch : studentFetch
    fetcher(`${admin ? '' : '/student'}/learning${path}`).then(data => { if (active) setState({ key: requestKey, data, error: '' }) }).catch(error => { if (active) setState({ key: requestKey, data: null, error: error.message }) })
    return () => { active = false }
  }, [path, admin, requestKey])
  const refresh = useCallback(() => setVersion(value => value + 1), [])
  const act = async (url, method, body, csrfToken) => {
    setBusy(true); setFeedback('')
    try {
      const data = await (admin ? adminFetch : studentFetch)(`${admin ? '' : '/student'}/learning${url}`, { method, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
      setFeedback(method === 'GET' ? 'Information loaded.' : 'Changes saved.'); refresh(); window.dispatchEvent(new Event('innovix-learning-change')); return data
    } catch (error) { setFeedback(error.message); return null }
    finally { setBusy(false) }
  }
  return { data: state.key === requestKey ? state.data : null, error: state.key === requestKey ? state.error : '', loading: Boolean(path) && state.key !== requestKey, refresh, feedback, busy, act }
}
