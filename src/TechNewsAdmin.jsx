import { useEffect, useState } from 'react'
import { adminFetch } from './api'
import { newsCategories } from '../shared/tech-news'
import { NewsArticle } from './TechNews'
import { newsDate } from './news-format'

function localDate(value = new Date()) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const newArticle = () => ({ title: '', category: newsCategories[0], description: '', content: '', keyTakeaways: '', studentsShouldLearn: '', careerTip: '', readTime: 3, publishDate: localDate(), featured: false, status: 'draft' })
const asPayload = (form) => ({ ...form, readTime: Number(form.readTime), publishDate: new Date(form.publishDate).toISOString(), keyTakeaways: form.keyTakeaways.split('\n').map((v) => v.trim()).filter(Boolean), studentsShouldLearn: form.studentsShouldLearn.split('\n').map((v) => v.trim()).filter(Boolean) })
export function TechNewsAdmin() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    adminFetch('/tech-news').then((data) => { if (active) setItems(data) }).catch((err) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])
  const mutate = async (path, method, body) => {
    setBusy(true); setError(''); setNotice('')
    try {
      await adminFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      setLoading(true); setRevision((value) => value + 1); setNotice(method === 'DELETE' ? 'Article deleted.' : 'Article saved.')
      return true
    } catch (err) { setError(err.message); return false }
    finally { setBusy(false) }
  }
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  const edit = (item) => { setPreview(null); setError(''); setForm({ ...item, publishDate: localDate(item.publishDate), keyTakeaways: item.keyTakeaways.join('\n'), studentsShouldLearn: item.studentsShouldLearn.join('\n') }) }
  const submit = async (event) => {
    event.preventDefault()
    const payload = asPayload(form)
    if (event.nativeEvent.submitter?.value === 'preview') { setPreview(payload); return }
    if (await mutate(`/tech-news${form._id ? `/${form._id}` : ''}`, form._id ? 'PUT' : 'POST', payload)) { setForm(null); setPreview(null) }
  }
  return <section className="admin-page news-admin"><span className="eyebrow">Student learning</span><h1>Tech News</h1><p>Create and curate Daily Tech News for Innovix interns.</p>{error && <div className="admin-error" role="alert">{error} <button onClick={() => { setError(''); setLoading(true); setRevision((value) => value + 1) }}>Retry loading</button></div>}{notice && <p role="status">{notice}</p>}<button className="admin-button dark" disabled={busy} onClick={() => { setForm(newArticle()); setPreview(null); setError('') }}>Create News</button>
    {form && <form className="admin-editor" onSubmit={submit}><h2>{form._id ? 'Edit News' : 'Create News'}</h2><fieldset disabled={busy}><div className="admin-form-grid">{[['title', 'Title', 200], ['description', 'Short Description', 500], ['content', 'Full Content', 30000], ['keyTakeaways', 'Key Takeaways (one per line)', 50000], ['studentsShouldLearn', 'What Students Should Learn (one per line)', 50000], ['careerTip', 'Career Tip', 2000]].map(([key, label, max]) => <label className={key === 'title' ? '' : 'admin-span'} key={key}>{label}{key === 'title' ? <input required maxLength={max} value={form[key]} onChange={(event) => change(key, event.target.value)} /> : <textarea required rows={key === 'content' ? 8 : 3} maxLength={max} value={form[key]} onChange={(event) => change(key, event.target.value)} />}</label>)}<label>Category<select value={form.category} onChange={(event) => change('category', event.target.value)}>{newsCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Read Time (minutes)<input type="number" min="1" max="120" step="1" required value={form.readTime} onChange={(event) => change('readTime', event.target.value)} /></label><label>Publish Date (your local time)<input type="datetime-local" required value={form.publishDate} onChange={(event) => change('publishDate', event.target.value)} /></label><label>Status<select value={form.status} onChange={(event) => change('status', event.target.value)}><option value="draft">Unpublished / Draft</option><option value="published">Published</option></select></label></div><p>Published articles appear to students once their publish date arrives. Content is plain text; use blank lines for paragraphs.</p><div className="admin-checks"><label><input type="checkbox" checked={form.featured} onChange={(event) => change('featured', event.target.checked)} />Featured</label></div><div className="admin-actions"><button className="admin-button dark" type="submit">{busy ? 'Saving...' : 'Save News'}</button><button className="admin-button light" type="submit" value="preview">Preview News</button><button className="admin-button light" type="button" onClick={() => { setForm(null); setPreview(null) }}>Cancel</button></div></fieldset></form>}
    {preview && <section className="news-preview" aria-label="News preview"><div className="news-preview-head"><b>Admin preview · not visible to students</b><button className="admin-button light" onClick={() => setPreview(null)}>Close preview</button></div><NewsArticle article={preview} /></section>}
    {loading ? <p role="status">Loading news...</p> : <div className="news-admin-list">{!items.length && <p>No articles yet. Create your first update.</p>}{items.map((item) => <article className="news-admin-row" key={item._id}><div><span className="eyebrow">{item.category}</span><h2>{item.title}</h2><p>{newsDate(item.publishDate)} · {item.status === 'published' && new Date(item.publishDate) > new Date() ? 'Scheduled' : item.status}{item.featured ? ' · Featured' : ''}</p></div><div className="admin-actions"><button className="admin-button light" disabled={busy} onClick={() => edit(item)}>Edit</button><button className="admin-button light" onClick={() => setPreview(item)}>Preview</button><button className="admin-button light" disabled={busy} onClick={() => mutate(`/tech-news/${item._id}`, 'PATCH', { status: item.status === 'published' ? 'draft' : 'published' })}>{item.status === 'published' ? 'Unpublish' : 'Publish'}</button><button className="admin-button light" disabled={busy} onClick={() => mutate(`/tech-news/${item._id}`, 'PATCH', { featured: !item.featured })}>{item.featured ? 'Unfeature' : 'Feature'}</button><button className="admin-button danger" disabled={busy} onClick={() => { if (window.confirm(`Delete “${item.title}”? This cannot be undone.`)) mutate(`/tech-news/${item._id}`, 'DELETE').then((ok) => { if (ok) { if (form?._id === item._id) setForm(null); if (preview?._id === item._id) setPreview(null) } }) }}>Delete</button></div></article>)}</div>}
  </section>
}
