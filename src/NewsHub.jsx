import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Lightbulb, Newspaper, Rocket, Sparkles } from 'lucide-react'
import { useSite } from './site-context'
import { useStudentSession } from './student-session-context'
import { DiscoverDrawer } from './LearnDiscover'
import { TodayTechUpdate } from './TechNews'

const topics = [
  { title: 'Learn & Discover', tab: 'For You', icon: Sparkles, copy: 'A fresh mix of discoveries selected for your internship and interests.' },
  { title: 'Today’s Facts', tab: 'Facts', icon: Lightbulb, copy: 'Short facts and interesting ideas to spark your curiosity.' },
  { title: 'Interesting Facts', tab: 'Facts', icon: Sparkles, copy: 'Explore the “Did You Know?” updates in your discovery feed.' },
  { title: 'Technology Updates', tab: 'News', icon: Rocket, copy: 'Follow new technology and useful developments in your field.' },
  { title: 'Domain-specific Learning', tab: 'Learn', icon: BookOpen, copy: 'Build your knowledge with practical lessons and developer tips.' },
]

export function NewsHub() {
  const { settings } = useSite()
  const session = useStudentSession()
  const [tab, setTab] = useState(null)
  if (!settings.newsEnabled) return null
  return <>
    <section className="section container news-hub">
      <div className="page-intro"><span className="eyebrow">Innovix News</span><h1>Stay curious.<br />Keep moving forward.</h1><p>Daily technology updates, interesting facts and practical learning, together in one place.</p></div>
      {settings.discoverEnabled && session?.student && <p className="news-personalized"><Sparkles size={18} /><span>Selected for <strong>{session.student.internshipDomain}</strong>. Explore your recommendations in Learn &amp; Discover.</span></p>}
      <div className="news-hub-grid">
        {settings.techNewsEnabled && <article className="news-hub-card"><Newspaper size={25} /><h2>Daily Tech News</h2><p>Read the latest published technology and career articles from Innovix Projects.</p><Link className="text-link" to="/tech-news">Read Daily Tech News <ArrowRight size={16} /></Link></article>}
        {settings.discoverEnabled && topics.map(({ title, tab: target, icon: Icon, copy }) => <article className="news-hub-card" key={title}><Icon size={25} /><h2>{title}</h2><p>{copy}</p>{session?.student ? <button className="text-link" aria-haspopup="dialog" onClick={() => setTab(target)}>Explore {title} <ArrowRight size={16} /></button> : session?.loading ? <span role="status">Loading your learning space...</span> : <Link className="text-link" to="/login">Sign in to explore <ArrowRight size={16} /></Link>}</article>)}
      </div>
      {!settings.techNewsEnabled && !settings.discoverEnabled && <p className="availability-notice">News and discoveries are currently unavailable. Please check back soon.</p>}
    </section>
    {settings.techNewsEnabled && <TodayTechUpdate />}
    {tab && settings.discoverEnabled && session?.student && <DiscoverDrawer key={`${session.student.studentId}-${tab}`} initialTab={tab} onClose={() => setTab(null)} />}
  </>
}
