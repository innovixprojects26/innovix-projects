import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'
import './internship-highlights.css'
import { apiFetch } from './api'

const events = [
  { type: 'Hackathons', title: 'Build something bold.', text: 'Turn a fresh idea into a working prototype through teamwork and creative problem solving.', symbol: '</>', color: '#6943c8', caption: 'IDEATE / BUILD / DEMO' },
  { type: 'Webinars', title: 'A new perspective awaits.', text: 'Explore technology, career paths and practical ideas in upcoming learning sessions.', symbol: '◎', color: '#087eaa', caption: 'LISTEN / ASK / DISCOVER' },
  { type: 'Workshops', title: 'Less theory. More making.', text: 'Explore hands-on sessions designed around practical tools and skills you can build on.', symbol: '{ }', color: '#4053cc', caption: 'EXPLORE / PRACTICE / CREATE' },
  { type: 'Tech Competitions', title: 'Put your ideas to the test.', text: 'Look forward to technical challenges that encourage curiosity and inventive thinking.', symbol: '✦', color: '#a03581', caption: 'THINK / SOLVE / GROW' },
]

const reviews = [
  { track: 'Web development', quote: 'Turning a small idea into a working page would make learning feel more practical.', focus: 'Learning by building' },
  { track: 'Data analytics', quote: 'A guided project would help me connect the concepts I study with problems I want to solve.', focus: 'Connecting ideas to practice' },
  { track: 'Career exploration', quote: 'Trying a new technical challenge would help me discover what I want to learn next.', focus: 'Finding a direction' },
]

function poster(event) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#101b32"/><stop offset="1" stop-color="${event.color}"/></linearGradient><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity=".08"/></pattern></defs><rect width="720" height="420" fill="url(#g)"/><rect width="720" height="420" fill="url(#p)"/><circle cx="565" cy="180" r="150" fill="none" stroke="#ffffff" stroke-opacity=".18"/><circle cx="565" cy="180" r="110" fill="none" stroke="#ffffff" stroke-opacity=".18"/><text x="42" y="58" fill="#b8c8e9" font-family="sans-serif" font-size="17" letter-spacing="4">INNOVIX / NEXT UP</text><text x="480" y="225" fill="#ffffff" font-family="monospace" font-size="100">${event.symbol.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</text><text x="42" y="300" fill="#ffffff" font-family="sans-serif" font-size="40" font-weight="700">${event.type}</text><text x="42" y="350" fill="#d7e5ff" font-family="sans-serif" font-size="16" letter-spacing="3">${event.caption}</text></svg>`)}`
}

function Carousel({ id, label, children }) {
  const viewport = useRef(null)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [touching, setTouching] = useState(false)
  const move = (direction) => {
    const node = viewport.current
    if (!node) return
    const max = node.scrollWidth - node.clientWidth
    const step = node.firstElementChild.getBoundingClientRect().width + 20
    const target = direction > 0 && node.scrollLeft >= max - 4 ? 0 : direction < 0 && node.scrollLeft <= 4 ? max : node.scrollLeft + direction * step
    node.scrollTo({ left: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  useEffect(() => {
    if (paused || hovered || focused || touching) return
    const timer = window.setInterval(() => {
      if (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) move(1)
    }, 4800)
    return () => window.clearInterval(timer)
  }, [paused, hovered, focused, touching])
  return <div className="ih-carousel" role="region" aria-roledescription="carousel" aria-label={label}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <div className="ih-controls">
      <span>Swipe or use the arrows to explore</span>
      <button type="button" aria-label={`Previous ${label}`} aria-controls={id} onClick={() => move(-1)}><ArrowLeft size={18} /></button>
      <button type="button" aria-label={paused ? `Play ${label}` : `Pause ${label}`} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
      <button type="button" aria-label={`Next ${label}`} aria-controls={id} onClick={() => move(1)}><ArrowRight size={18} /></button>
    </div>
    <div id={id} className="ih-track" ref={viewport} tabIndex={0} aria-label={`${label}; use left and right arrow keys to browse`}
      onPointerDown={() => setTouching(true)} onPointerUp={() => setTouching(false)} onPointerCancel={() => setTouching(false)} onLostPointerCapture={() => setTouching(false)}
      onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1) } }}>
      {children}
    </div>
  </div>
}

export default function InternshipHighlights() {
  const [published, setPublished] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const data = await apiFetch('/events')
        if (!Array.isArray(data)) throw new Error('Invalid event response.')
        if (active) { setPublished(data.filter(item => item.enabled === true && item.status === 'published')); setError('') }
      } catch { if (active) { setPublished([]); setError('Events could not be loaded. Please try again.') } }
      finally { pending = false; if (active) setLoading(false) }
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('innovix-content-change', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('innovix-content-change', refresh) }
  }, [attempt])
  const [publicReviews, setPublicReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError] = useState('')
  const [reviewAttempt, setReviewAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const data = await apiFetch('/student-reviews')
        if (!Array.isArray(data)) throw new Error('Invalid review response')
        if (active) { setPublicReviews(data); setReviewsError('') }
      } catch { if (active) { setPublicReviews([]); setReviewsError('Student reviews could not be loaded.') } }
      finally { pending = false; if (active) setReviewsLoading(false) }
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('innovix-content-change', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('innovix-content-change', refresh) }
  }, [reviewAttempt])
  const cards = published.length ? published : events

  return <div className="internship-highlights">
    <section className="section container" aria-labelledby="ih-events-title">
      <div className="ih-heading"><span className="eyebrow">Beyond the internship</span><h2 id="ih-events-title">Upcoming Events <span>— Learn, Compete &amp; Grow</span></h2><p>Make room for your next discovery. Explore what’s ahead in the Innovix learning community.</p><small>Event previews · Dates, fees and registration details will be announced.</small></div>
      {loading ? <p role="status">Loading upcoming events...</p> : error ? <p role="alert">{error} <button className="button button-outline" onClick={() => { setLoading(true); setAttempt(value => value + 1) }}>Retry</button></p> : <Carousel id="ih-events" label="upcoming events">
        {cards.map((event, index) => {
          const managed = Boolean(event._id)
          const illustration = events[['Hackathon', 'Webinar', 'Workshop', 'Tech Competition'].indexOf(event.category)] || events[0]
          const fallback = poster(managed ? illustration : event)
          return <article className="ih-event" key={event._id || event.type} aria-label={`${index + 1} of ${cards.length}: ${event.title}`}>
            <img src={event.posterUrl || fallback} alt={event.title} width="720" height="420" loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = fallback }} />
            <div className="ih-event-body"><div className="ih-meta"><span>{event.category || event.type}</span><span className="ih-badge">{managed ? event.isFree ? 'FREE' : 'Paid' : 'Coming Soon'}</span></div><h3>{event.title}</h3><p>{event.description || event.text}</p>
              {managed && <p><time dateTime={event.eventDate}>{new Date(event.eventDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</time></p>}
              <div className="ih-event-footer">{managed ? event.registrationUrl ? <a className="text-link" href={event.registrationUrl} target="_blank" rel="noopener noreferrer">Register / View details <ArrowRight size={17} aria-hidden="true" /></a> : 'Registration details coming soon.' : <>Stay curious. More details soon. <ArrowRight size={17} aria-hidden="true" /></>}</div>
            </div>
          </article>
        })}
      </Carousel>}
    </section>
    <section className="section ih-feedback" aria-labelledby="ih-feedback-title"><div className="container">
      <div className="ih-heading"><span className="eyebrow">The learning journey</span><h2 id="ih-feedback-title">Student Experiences <span>&amp; Feedback</span></h2><p>A space for student voices, reflections and discoveries.</p>{!reviewsLoading && !reviewsError && !publicReviews.length && <div className="ih-demo-notice">Demo testimonials only ? illustrative sample text, not real student reviews or verified outcomes.</div>}</div>
      {reviewsLoading ? <p role="status">Loading student reviews...</p> : reviewsError ? <p role="alert">{reviewsError} <button className="button button-outline" onClick={() => { setReviewsLoading(true); setReviewAttempt(value => value + 1) }}>Retry</button></p> : <Carousel id="ih-reviews" label={publicReviews.length ? 'student reviews' : 'demo testimonials'}>
        {publicReviews.length ? publicReviews.map((review, index) => <figure className="ih-review" key={review._id} aria-label={`${index + 1} of ${publicReviews.length}: student review`}>
          <div className="ih-meta"><span className="ih-badge">Verified student review</span><span aria-label={`${review.rating} out of 5 stars`}>{review.rating} / 5</span></div>
          <h3>{review.domain}</h3><blockquote>{review.reviewText}</blockquote><figcaption>{review.avatarUrl && <img className="ih-avatar" src={review.avatarUrl} alt="" width="44" height="44" loading="lazy" style={{ objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />}<div><b>{review.studentName}</b><span>{review.domain}</span></div></figcaption>
        </figure>) :
        reviews.map((review, index) => <figure className="ih-review" key={review.track} aria-label={`${index + 1} of ${reviews.length}: demo testimonial`}>
          <div className="ih-meta"><span className="ih-badge">DEMO TESTIMONIAL</span><span className="ih-quote" aria-hidden="true">“</span></div><h3>{review.focus}</h3><blockquote>{review.quote}</blockquote><figcaption><span className="ih-avatar" aria-hidden="true">0{index + 1}</span><div><b>Illustrative student perspective</b><span>{review.track} · Demo content</span></div></figcaption>
        </figure>)}
      </Carousel>}
    </div></section>
  </div>
}
