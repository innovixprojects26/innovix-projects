import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Clock, Search } from 'lucide-react'
import { apiFetch } from './api'
import { newsDate } from './news-format'
import { newsFilters } from '../shared/tech-news'
import './tech-news.css'

function useNews(path) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    apiFetch(path).then((data) => { if (active) setState({ data, loading: false, error: '' }) }).catch((error) => { if (active) setState({ data: null, loading: false, error: error.message }) })
    return () => { active = false }
  }, [path, attempt])
  return { ...state, retry: () => { setState({ data: null, loading: true, error: '' }); setAttempt((value) => value + 1) } }
}
function NewsState({ loading, error, retry }) {
  return <>{loading && <p role="status">Loading tech updates...</p>}{error && <div role="alert"><p>{error}</p><button className="button button-outline" onClick={retry}>Try again</button></div>}</>
}
function NewsCard({ article, latest }) {
  return <article className="news-card"><div className="news-tags"><span>{article.category}</span>{latest && <b>New</b>}{article.featured && <b>Featured</b>}</div><h2>{article.title}</h2><p>{article.description}</p><div className="news-meta"><time dateTime={article.publishDate}>{newsDate(article.publishDate)}</time><span><Clock size={14} /> {article.readTime} min read</span></div><Link className="button button-outline" to={`/tech-news/${article._id}`}>Read Full Update <ArrowRight size={16} /></Link></article>
}
export function TechNewsPage() {
  const state = useNews('/tech-news')
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const category = Object.hasOwn(newsFilters, params.get('category')) ? params.get('category') : 'All'
  const articles = state.data || []
  const filtered = articles.filter((item) => newsFilters[category].includes(item.category) && `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="section container news-page"><div className="page-intro"><span className="eyebrow">Daily Tech News</span><h1>Stay Updated. Keep Learning.</h1><p>Daily technology updates, development trends and career insights curated for Innovix Projects interns.</p></div><label className="news-search"><Search size={18} /><input aria-label="Search news by title or topic" placeholder="Search by title or topic..." value={search} onChange={(event) => setParams({ category, search: event.target.value }, { replace: true })} /></label><div className="news-filters" aria-label="News categories">{Object.keys(newsFilters).map((name) => <button key={name} aria-pressed={category === name} onClick={() => setParams({ category: name, search }, { replace: true })}>{name}</button>)}</div><NewsState {...state} />{!state.loading && !state.error && <><p className="news-count" role="status">{filtered.length} {filtered.length === 1 ? 'update' : 'updates'}</p>{filtered.length ? <div className="news-grid">{filtered.map((article) => <NewsCard key={article._id} article={article} latest={article._id === articles[0]?._id} />)}</div> : <p className="news-empty">{articles.length ? 'No updates match your search. Try another topic or category.' : 'Fresh updates are on the way. Check back soon.'}</p>}</>}</section>
}
export function NewsArticle({ article }) {
  return <article className="news-article"><div className="news-tags"><span>{article.category}</span>{article.featured && <b>Featured</b>}</div><h1>{article.title}</h1><div className="news-meta"><time dateTime={article.publishDate}>{newsDate(article.publishDate)}</time><span><Clock size={14} /> {article.readTime} min read</span></div><p className="news-lede">{article.description}</p><div className="news-body">{article.content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><section><h2>Key Takeaways</h2><ul>{article.keyTakeaways.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section><h2>What Students Should Learn</h2><ul>{article.studentsShouldLearn.map((item, index) => <li key={index}>{item}</li>)}</ul></section><aside className="news-tip"><span className="eyebrow">Career Tip of the Day</span><p>{article.careerTip}</p></aside></article>
}
export function TechNewsDetail() {
  const { id } = useParams()
  return <NewsDetail key={id} id={id} />
}
function NewsDetail({ id }) {
  const state = useNews(`/tech-news/${encodeURIComponent(id)}`)
  return <section className="section container news-detail"><Link className="back-link" to="/tech-news"><ArrowLeft size={16} /> Back to Daily Tech News</Link><NewsState {...state} />{state.data && <NewsArticle article={state.data} />}</section>
}
export function TodayTechUpdate() {
  const state = useNews('/tech-news?latest=true')
  const article = state.data?.[0]
  return <section className="section container"><div className="news-today"><div><span className="eyebrow">Daily Tech News</span><h2>Today’s Tech Update</h2><Link className="text-link" to="/tech-news">View All Tech News <ArrowRight size={16} /></Link></div><div><NewsState {...state} />{article && <><div className="news-tags"><span>{article.category}</span></div><h3>{article.title}</h3><p>{article.description}</p><time dateTime={article.publishDate}>{newsDate(article.publishDate)}</time><Link className="text-link" to={`/tech-news/${article._id}`}>Read Full Update <ArrowRight size={16} /></Link></>}{!state.loading && !state.error && !article && <p>Your next learning update is coming soon.</p>}</div></div></section>
}
