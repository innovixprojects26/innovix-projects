import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiFetch } from './api'
import { SiteContext, initialSite, useSite } from './site-context'

export function SiteProvider({ children }) {
  const [state, setState] = useState({ ...initialSite, loading: true })
  const [attempt, setAttempt] = useState(0)
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const data = await apiFetch('/configuration')
        if (!data?.settings || !data?.homepage || !Array.isArray(data.domains) || !Array.isArray(data.announcements)) throw new Error('Invalid website settings response')
        if (active) setState(previous => {
          const next = { ...data, loading: false, error: '' }
          // An unchanged poll must not retrigger every content request on the page.
          return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
        })
      }
      catch (error) { if (active) setState(previous => ({ ...previous, loading: false, error: error.message })) }
      finally { pending = false }
    }
    refresh()
    const timer = setInterval(() => { if (!document.hidden) refresh() }, 60000)
    window.addEventListener('focus', refresh)
    window.addEventListener('innovix-content-change', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('innovix-content-change', refresh) }
  }, [pathname, attempt])
  return <SiteContext.Provider value={{ ...state, retry: () => setAttempt(value => value + 1) }}>{children}</SiteContext.Provider>
}
export function AvailabilityNotice({ children = 'This section is currently unavailable. Please check back soon.' }) { return <section className="section container"><p className="availability-notice" role="status">{children}</p></section> }
export function PublicContent({ children }) {
  const site = useSite()
  const { pathname } = useLocation()
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname)) return children
  if (site.loading) return <AvailabilityNotice>Loading website...</AvailabilityNotice>
  if (site.error) return <AvailabilityNotice>Website settings could not be loaded. <button className="button button-outline" onClick={site.retry}>Retry</button></AvailabilityNotice>
  const settings = site.settings
  if ((!settings.internshipsEnabled && pathname === '/internships') || (!settings.newsEnabled && (pathname === '/news' || pathname.startsWith('/tech-news')))) return <AvailabilityNotice />
  if (!settings.projectsEnabled && ['/projects', '/project-finder', '/compare'].some(path => pathname === path || pathname.startsWith(`${path}/`))) return <AvailabilityNotice>Projects are currently unavailable. Please check back soon.</AvailabilityNotice>
  if ((!settings.projectEnquiriesEnabled && pathname.endsWith('/enquire')) || (!settings.customRequestsEnabled && pathname === '/build-your-project') || (!settings.techNewsEnabled && pathname.startsWith('/tech-news'))) return <AvailabilityNotice />
  return <>{site.announcements.map(item => <aside className="site-announcement" data-type={item.type} key={item._id}><div className="container"><b>{item.title}</b><p>{item.message}</p></div></aside>)}{site.homepage.notice && <aside className="site-announcement"><div className="container">{site.homepage.notice}</div></aside>}{children}</>
}
