import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSite } from './site-context'
import { useStudentSession } from './student-session-context'
import { useLearning, dateLabel } from './learning-api'
import { LearningState } from './learning-ui'

export function NotificationCenter() {
  const session = useStudentSession(), { settings } = useSite()
  if (!session?.student || !settings.notificationsEnabled) return null
  return <Notifications key={session.student.studentId} />
}
function Notifications() {
  const [open, setOpen] = useState(false), [unread, setUnread] = useState(false), [page, setPage] = useState(1)
  const state = useLearning(`/notifications?unread=${unread}&page=${page}`), { csrfToken } = useStudentSession()
  const { refresh: refreshInbox } = state
  useEffect(() => {
    const refresh = () => { if (!document.hidden) refreshInbox() }
    const timer = setInterval(refresh, 120000)
    window.addEventListener('innovix-learning-change', refresh)
    return () => { clearInterval(timer); window.removeEventListener('innovix-learning-change', refresh) }
  }, [refreshInbox])
  return <><button className="notification-bell" aria-label={`Notifications${state.data?.unreadCount ? `, ${state.data.unreadCount} unread` : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); state.refresh() }}><Bell size={19} />{state.data?.unreadCount > 0 && <span>{state.data.unreadCount > 99 ? '99+' : state.data.unreadCount}</span>}</button>{open && <NotificationPanel onClose={() => setOpen(false)}><div className="learning-title"><h2 id="notification-title">Notifications</h2><button aria-label="Close notifications" onClick={() => setOpen(false)}><X /></button></div><nav className="learning-tabs" aria-label="Notification filters"><button aria-pressed={!unread} onClick={() => { setUnread(false); setPage(1) }}>All</button><button aria-pressed={unread} onClick={() => { setUnread(true); setPage(1) }}>Unread</button></nav><button className="text-link" disabled={state.busy} onClick={() => state.act('/notifications/read-all', 'POST', {}, csrfToken)}>Mark All as Read</button><LearningState state={state} />{state.data?.items.map(item => <article className="notification-item" data-unread={!item.readAt} key={item._id}><h3>{item.title}</h3><p>{item.message}</p><small>{dateLabel(item.createdAt)}</small><div className="learning-actions"><Link to={item.href || '/student'} onClick={() => { if (!item.readAt) state.act(`/notifications/${item._id}/read`, 'POST', {}, csrfToken); setOpen(false) }}>Open update →</Link>{!item.readAt && <button disabled={state.busy} onClick={() => state.act(`/notifications/${item._id}/read`, 'POST', {}, csrfToken)}>Mark as Read</button>}</div></article>)}{state.data?.items.length === 0 && <p className="learning-empty">You’re all caught up.</p>}<div className="learning-actions">{page > 1 && <button onClick={() => setPage(value => value - 1)}>Previous</button>}{state.data?.hasMore && <button onClick={() => setPage(value => value + 1)}>Next</button>}</div></NotificationPanel>}</>
}
function NotificationPanel({ children, onClose }) {
  const ref = useRef(null)
  useEffect(() => { const dialog = ref.current, previous = document.activeElement, overflow = document.body.style.overflow; dialog.showModal(); document.body.style.overflow = 'hidden'; return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus() } }, [])
  return createPortal(<dialog ref={ref} className="notification-panel" aria-labelledby="notification-title" onCancel={event => { event.preventDefault(); onClose() }}>{children}</dialog>, document.body)
}
