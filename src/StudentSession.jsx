import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { StudentSessionContext, useStudentSession } from './student-session-context'
import { studentFetch } from './student-api'
import './student-auth.css'

export function StudentSessionProvider({ children }) {
  const [state, setState] = useState({ student: null, csrfToken: '', expiresAt: null, loading: true, error: '' })
  const generation = useRef(0)
  const channel = useRef(null)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const data = await studentFetch('/student/me')
      if (request === generation.current) setState({ ...data, loading: false, error: '' })
    } catch (error) {
      if (request === generation.current) setState({ student: null, csrfToken: '', expiresAt: null, loading: false, error: error.status === 401 ? '' : 'Your session could not be checked. Please try again.' })
    }
  }, [])
  useEffect(() => {
    const initialCheck = setTimeout(refresh, 0)
    const clear = () => { generation.current++; setState({ student: null, csrfToken: '', expiresAt: null, loading: false, error: '' }) }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('student-session-ended', clear)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const tabChannel = 'BroadcastChannel' in window ? new BroadcastChannel('innovix-student-session') : null
    channel.current = tabChannel
    if (tabChannel) tabChannel.onmessage = refresh
    return () => { clearTimeout(initialCheck); window.removeEventListener('student-session-ended', clear); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', onVisible); tabChannel?.close() }
  }, [refresh])
  useEffect(() => {
    if (!state.expiresAt) return
    const timer = setTimeout(refresh, Math.min(Math.max(new Date(state.expiresAt).getTime() - Date.now(), 0), 2147483647))
    return () => clearTimeout(timer)
  }, [state.expiresAt, refresh])
  const login = async (credentials) => {
    const data = await studentFetch('/student/login', { method: 'POST', body: JSON.stringify(credentials) })
    generation.current++; setState({ ...data, loading: false, error: '' }); channel.current?.postMessage('changed')
    return data
  }
  const logout = async () => {
    try { await studentFetch('/student/logout', { method: 'POST', headers: { 'X-CSRF-Token': state.csrfToken }, body: '{}' }) }
    catch (error) { if (error.status !== 401) throw error }
    generation.current++; setState({ student: null, csrfToken: '', expiresAt: null, loading: false, error: '' }); channel.current?.postMessage('changed')
  }
  return <StudentSessionContext.Provider value={{ ...state, login, logout, refresh }}>{children}</StudentSessionContext.Provider>
}

export function RequireStudent({ children }) {
  const session = useStudentSession()
  const location = useLocation()
  if (session.loading) return <section className="section container" role="status">Checking your student session...</section>
  if (session.error) return <section className="section container" role="alert"><p>{session.error}</p><button className="button button-outline" onClick={session.refresh}>Retry</button></section>
  if (!session.student) return <Navigate to="/login" state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }} replace />
  return children
}

export function StudentNav({ onNavigate }) {
  const { student, loading, logout } = useStudentSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const menu = useRef(null)
  const close = () => { if (menu.current) menu.current.open = false; onNavigate?.() }
  const signOut = async () => {
    setBusy(true); setError('')
    try { await logout(); close(); navigate('/', { replace: true }) }
    catch { setError('Could not log out. Please try again.') }
    finally { setBusy(false) }
  }
  if (loading) return <Link to="/login" onClick={onNavigate}>Log in</Link>
  if (!student) return <><Link to="/login" onClick={onNavigate}>Log in</Link><Link className="button button-dark" to="/register" onClick={onNavigate}>Join Innovix</Link></>
  return <details className="student-account-menu" ref={menu}><summary><span>{student.fullName}</span><ChevronDown size={14} /></summary><div className="student-account-links"><Link to="/student" onClick={close}>Dashboard</Link><Link to="/student/internship" onClick={close}>My Internship</Link><button onClick={signOut} disabled={busy}>{busy ? 'Logging out...' : 'Logout'}</button>{error && <p role="alert">{error}</p>}</div></details>
}
