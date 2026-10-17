import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import './innovix-ai-promo.css'

const dismissalKey = 'innovix-ai-promo-dismissed'
let dismissedInMemory = false
const excluded = /(?:^|\/)(?:admin|student|login|register|registration|signup|sign-in|sign-up|forgot-password|reset-password|payment|payments|checkout)(?:\/|$)/i

export default function InnovixAiPromo() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return dismissedInMemory || sessionStorage.getItem(dismissalKey) === '1' } catch { return dismissedInMemory }
  })
  const panel = useRef(null)
  const due = useRef(0)
  const lastActivity = useRef(0)
  const shownAt = useRef(0)
  const allowed = !excluded.test(pathname) && !/^\/internships\/.+/i.test(pathname)

  const dismiss = () => {
    dismissedInMemory = true
    try { sessionStorage.setItem(dismissalKey, '1') } catch { /* Keep dismissal in memory if storage is unavailable. */ }
    if (panel.current?.contains(document.activeElement)) document.activeElement.blur()
    setDismissed(true)
    setVisible(null)
  }

  useEffect(() => {
    if (!allowed || dismissed) return
    if (!due.current) { due.current = Date.now() + 30000; lastActivity.current = Date.now() }
    const activity = () => { lastActivity.current = Date.now() }
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']
    events.forEach(event => window.addEventListener(event, activity, { passive: true }))
    const timer = window.setInterval(() => {
      const now = Date.now()
      const focused = document.activeElement
      const busy = focused?.matches('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('dialog[open], [aria-modal="true"], .razorpay-container')
      if (document.hidden || !document.hasFocus() || busy || now - lastActivity.current > 60000) {
        setVisible(null)
        return
      }
      if (shownAt.current && now - shownAt.current >= 20000 && !panel.current?.contains(focused) && !panel.current?.matches(':hover')) setVisible(null)
      if (now >= due.current) {
        shownAt.current = now
        due.current = now + 300000
        setVisible(pathname)
      }
    }, 1000)
    return () => {
      clearInterval(timer)
      events.forEach(event => window.removeEventListener(event, activity))
    }
  }, [allowed, dismissed, pathname])


  const open = allowed && visible === pathname && !dismissed
  return <aside ref={panel} className={`innovix-ai-promo${open ? ' is-visible' : ''}`} aria-label="INNOVIX AI announcement"
    aria-hidden={!open} inert={!open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss() } }}>
    <button className="ai-promo-close" type="button" aria-label="Dismiss INNOVIX AI announcement" onClick={dismiss}><X size={20} /></button>
    <svg className="ai-promo-mascot" viewBox="0 0 160 140" aria-hidden="true" focusable="false">
      <ellipse className="ai-mascot-shadow" cx="76" cy="128" rx="34" ry="6" />
      <g className="ai-mascot-float" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path className="ai-mascot-shell" d="M51 91 Q38 90 33 105 Q32 112 39 110 L51 101 M58 111 L55 120 Q62 125 68 119 L70 112 M85 112 L87 120 Q94 125 100 119 L97 109" />
        <g className="ai-mascot-wave"><path className="ai-mascot-shell" d="M103 92 Q117 92 124 77 L127 62 Q129 56 133 60 L134 70 Q144 65 146 70 Q148 77 140 84 Q131 106 108 105 Z" /></g>
        <rect className="ai-mascot-shell" x="50" y="80" width="57" height="36" rx="17" />
        <path d="M78 29 V20" /><circle className="ai-mascot-signal" cx="78" cy="15" r="5" />
        <rect className="ai-mascot-shell" x="33" y="30" width="90" height="59" rx="25" />
        <rect className="ai-mascot-face" x="43" y="40" width="70" height="38" rx="16" stroke="none" />
        <g className="ai-mascot-eyes"><path d="M61 53 V59 M95 53 V59" /></g>
        <path d="M72 64 Q78 70 84 64" fill="none" />
        <path className="ai-mascot-cheeks" d="M52 64 H57 M99 64 H104" />
        <path d="m73 98 4 4 7-8" fill="none" />
      </g>
    </svg>
    <div aria-live="polite" aria-atomic="true">{open && <><h2>Hi! I'm INNOVIX AI 👋</h2><p className="ai-promo-copy">Chat freely, explore project ideas, understand topics, and build your projects step by step.</p></>}</div>
    <div className="ai-promo-footer"><span>Coming Soon!</span><button type="button" onClick={dismiss}>Got It</button></div>
  </aside>
}
