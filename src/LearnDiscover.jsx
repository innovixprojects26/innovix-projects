import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, BookOpen, Briefcase, Compass, ExternalLink, Lightbulb, Newspaper, RefreshCw, Rocket, Sparkles, X } from 'lucide-react'
import { useStudentSession } from './student-session-context'
import { useSite } from './site-context'
import { studentFetch } from './student-api'
import { discoverTabs, discoverTypeLabels } from '../shared/discover'
import './discover.css'

const icons = { NEWS: Newspaper, FACT: Lightbulb, DID_YOU_KNOW: Sparkles, QUICK_LEARN: BookOpen, NEW_TECH: Rocket, CAREER: Briefcase, TIP: Compass }
const dateLabel = value => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export function DiscoverCard({ item, onOpen }) {
  const Icon = icons[item.type] || Sparkles
  return <article className="discover-card" data-type={item.type}><div className="discover-meta"><span className="discover-type"><Icon size={14} />{discoverTypeLabels[item.type]}</span>{item.isNew && <b className="discover-new">NEW</b>}{item.trending && <b>Trending</b>}{item.featured && <b>Featured</b>}</div><button className="discover-card-title" onClick={() => onOpen(item)}><h3>{item.title}</h3></button><p>{item.summary}</p><div className="discover-tags"><span>{item.category}</span><span>{item.readTime} min learn</span></div><small>{item.sourceName} · {dateLabel(item.publishedAt)}</small>{item.read && <small className="discover-read">Read</small>}</article>
}
export function DiscoverDetail({ item, onBack }) {
  return <article className="discover-detail">{onBack && <button className="discover-back" onClick={onBack}><ArrowLeft size={16} />Back to discoveries</button>}<span className="discover-type">{discoverTypeLabels[item.type]}</span><h2>{item.title}</h2><p className="discover-summary">{item.summary}</p>{item.imported && <small>Publisher feed excerpt; learning prompts below are provided by Innovix.</small>}{item.explanation && <p>{item.explanation}</p>}<dl><div><dt>Why this matters</dt><dd>{item.whyItMatters || 'Read the update and consider how it relates to your learning goals.'}</dd></div><div><dt>What you can learn</dt><dd>{item.whatYouCanLearn || 'Explore this topic through practice and reliable documentation.'}</dd></div><div><dt>Key takeaway</dt><dd>{item.takeaway || 'Discuss this topic with your mentor.'}</dd></div></dl><div className="discover-tags"><span>{item.category}</span><span>{item.domains.join(' · ')}</span><span>{item.readTime} min learn</span></div><p className="discover-source">Source: {item.sourceName}<br />Published {dateLabel(item.publishedAt)}{item.retrievedAt && <><br />Retrieved {dateLabel(item.retrievedAt)}</>}</p>{item.sourceUrl && <a className="button button-outline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Read Original Source <ExternalLink size={15} /></a>}</article>
}
export function LearnDiscover() {
  const session = useStudentSession()
  const site = useSite()
  if (!session?.student || site.loading || site.error || !site.settings.newsEnabled || !site.settings.discoverEnabled) return null
  return <DiscoverLauncher key={session.student.studentId} />
}
function DiscoverLauncher() {
  const [open, setOpen] = useState(false)
  return <><button className="discover-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><Sparkles size={19} /><span>Learn & Discover</span></button>{open && <DiscoverDrawer onClose={() => setOpen(false)} />}</>
}
export function DiscoverDrawer({ onClose, initialTab = 'For You' }) {
  const { student, csrfToken } = useStudentSession()
  const dialog = useRef(null)
  const detailHeading = useRef(null)
  const generation = useRef(0)
  const [tab, setTab] = useState(Object.hasOwn(discoverTabs, initialTab) ? initialTab : 'For You')
  const [state, setState] = useState({ items: [], loading: true, error: '', page: 1, hasMore: false, unreadCount: 0 })
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState(null)
  const [opening, setOpening] = useState(false)
  const [detailError, setDetailError] = useState('')
  useEffect(() => {
    const element = dialog.current
    const requests = generation
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    element.showModal(); document.body.style.overflow = 'hidden'
    return () => { requests.current++; element.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    studentFetch(`/student/discover?tab=${encodeURIComponent(tab)}&page=1`, { signal: controller.signal }).then(data => setState({ ...data, loading: false, error: '' })).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error.message })) })
    return () => controller.abort()
  }, [tab, attempt])
  const reset = () => { generation.current++; setSelected(null); setDetailError(''); setOpening(false); setState(previous => ({ ...previous, items: [], loading: true, error: '' })); setAttempt(value => value + 1) }
  const loadMore = async () => {
    setState(previous => ({ ...previous, loading: true, error: '' }))
    try { const data = await studentFetch(`/student/discover?tab=${encodeURIComponent(tab)}&page=${state.page + 1}`); setState(previous => ({ ...data, items: [...previous.items, ...data.items.filter(item => !previous.items.some(old => old._id === item._id))], loading: false, error: '' })) }
    catch (error) { setState(previous => ({ ...previous, loading: false, error: error.message })) }
  }
  const openItem = async item => {
    const current = ++generation.current
    setOpening(true); setDetailError('')
    try {
      const detail = await studentFetch(`/student/discover/${item._id}`)
      if (generation.current !== current) return
      setSelected(detail)
      requestAnimationFrame(() => detailHeading.current?.focus())
      await studentFetch(`/student/discover/${item._id}/read`, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: '{}' })
      if (generation.current !== current) return
      setState(previous => ({ ...previous, unreadCount: Math.max(0, previous.unreadCount - (detail.isNew ? 1 : 0)), items: previous.items.map(row => row._id === item._id ? { ...row, read: true, isNew: false } : row) }))
    } catch (error) { if (generation.current === current) setDetailError(error.message) }
    finally { if (generation.current === current) setOpening(false) }
  }
  return createPortal(<dialog ref={dialog} className="discover-drawer" aria-labelledby="discover-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right) onClose() } }}><header className="discover-header"><div><span className="eyebrow">{student.internshipDomain}</span><h2 id="discover-title">Today for You</h2><p>Fresh updates selected for your learning journey.</p></div><button className="discover-icon-button" aria-label="Close Learn & Discover" onClick={onClose}><X /></button></header><div className="discover-toolbar"><nav aria-label="Discovery categories">{Object.keys(discoverTabs).map(value => <button key={value} aria-pressed={tab === value} disabled={state.loading || opening} onClick={() => { setTab(value); reset() }}>{value}</button>)}</nav><button className="discover-icon-button" aria-label="Refresh discoveries" disabled={state.loading || opening} onClick={reset}><RefreshCw size={17} /></button></div><div className="discover-body" ref={detailHeading} tabIndex={-1}>{detailError && <p className="discover-error" role="alert">{detailError}</p>}{opening && <p role="status">Opening update...</p>}{selected ? <DiscoverDetail item={selected} onBack={() => { generation.current++; setSelected(null); setOpening(false); setDetailError('') }} /> : <>{!state.loading && <p className="discover-unread">{state.unreadCount ? `${state.unreadCount} recent unread discoveries` : 'Explore at your own pace.'}</p>}{state.items.map(item => <DiscoverCard key={item._id} item={item} onOpen={openItem} />)}{state.loading && <div className="discover-skeletons" role="status" aria-label="Loading discoveries">{[0, 1, 2].map(value => <div key={value}><span /><span /><span /></div>)}</div>}{state.error && <div className="discover-error" role="alert"><p>{state.error}</p><button className="button button-outline" onClick={reset}>Try again</button></div>}{!state.loading && !state.error && !state.items.length && <div className="discover-empty"><Compass size={36} /><h3>Your next discovery is on its way.</h3><p>Approved updates for your domain will appear here. Try another topic or check back later.</p></div>}{state.hasMore && !state.loading && <button className="button button-outline discover-more" onClick={loadMore}>Load more discoveries</button>}</>}</div></dialog>, document.body)
}
