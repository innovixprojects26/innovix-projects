import { useEffect, useRef, useState } from 'react'
import { adminFetch } from './api'
import { ContentVideoPlayer } from './ContentCreation'
import { contentVideoPath, readVideoDuration, uploadContentFile } from './content-video-api'

const localDate = (value = new Date()) => {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const emptyForm = () => ({ title: '', module: '', description: '', publishDate: localDate(), status: 'draft', hasVideo: false, hasThumbnail: false })

export function ContentVideoAdmin() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState(null)
  const [video, setVideo] = useState(null)
  const [thumbnail, setThumbnail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const uploadController = useRef(null)
  const formRef = useRef(null)
  useEffect(() => () => uploadController.current?.abort(), [])
  useEffect(() => {
    let active = true
    adminFetch(contentVideoPath).then((data) => { if (active) setItems(data) }).catch((err) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])
  const reload = () => { setLoading(true); setRevision((value) => value + 1) }
  const edit = (item) => {
    setForm(item ? { ...item, publishDate: localDate(item.publishDate) } : emptyForm())
    setVideo(null); setThumbnail(null); setError(''); setNotice('')
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  const run = async (operation) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const save = (event) => {
    event.preventDefault()
    if (!form.hasVideo && !video) { setError('Choose a video file.'); return }
    if (video && (!/\.(mp4|webm|mov)$/i.test(video.name) || video.size > 1024 ** 3 || !video.size)) { setError('Choose a non-empty MP4, WebM or MOV file up to 1 GB.'); return }
    if (thumbnail && (!/\.(jpe?g|png|webp)$/i.test(thumbnail.name) || thumbnail.size > 5 * 1024 ** 2 || !thumbnail.size)) { setError('Choose a non-empty JPG, PNG or WebP thumbnail up to 5 MB.'); return }
    run(async () => {
      const payload = { title: form.title, module: form.module, description: form.description, publishDate: new Date(form.publishDate).toISOString(), status: form.status, ...(form.duration ? { duration: form.duration } : {}) }
      let id = form._id
      uploadController.current = new AbortController()
      try {
        if (!id) {
          const created = await adminFetch(contentVideoPath, { method: 'POST', body: JSON.stringify({ ...payload, status: 'draft' }) })
          id = created._id
          setForm((previous) => ({ ...previous, _id: id }))
        }
        if (video && !form.hasVideo) {
          const duration = await readVideoDuration(video)
          setProgress({ label: 'Video', percent: 0 })
          await uploadContentFile(id, 'video', video, (percent) => setProgress({ label: 'Video', percent }), uploadController.current.signal)
          setForm((previous) => ({ ...previous, hasVideo: true, duration }))
          setVideo(null)
          if (duration) payload.duration = duration
        }
        if (thumbnail && !form.hasThumbnail) {
          setProgress({ label: 'Thumbnail', percent: 0 })
          await uploadContentFile(id, 'thumbnail', thumbnail, (percent) => setProgress({ label: 'Thumbnail', percent }), uploadController.current.signal)
          setForm((previous) => ({ ...previous, hasThumbnail: true }))
          setThumbnail(null)
        }
        await adminFetch(`${contentVideoPath}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        setForm(null); setNotice('Video saved. Published videos appear once their publish date arrives.')
      } finally { setProgress(null); uploadController.current = null; reload() }
    })
  }
  const toggle = (item) => run(async () => {
    await adminFetch(`${contentVideoPath}/${item._id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'published' ? 'draft' : 'published' }) })
    setNotice('Video status updated.'); reload()
  })
  const move = (index, offset) => run(async () => {
    const ordered = [...items]
    ;[ordered[index], ordered[index + offset]] = [ordered[index + offset], ordered[index]]
    const data = await adminFetch(`${contentVideoPath}/reorder`, { method: 'PUT', body: JSON.stringify({ ids: ordered.map((item) => item._id) }) })
    setItems(data); setNotice('Video order saved.')
  })
  const openPreview = (item) => run(async () => {
    const { token } = await adminFetch(`${contentVideoPath}/${item._id}/preview`, { method: 'POST' })
    setPreview({ item, token })
  })
  const remove = (item) => {
    if (!window.confirm(`Delete “${item.title}” and its uploaded files? This cannot be undone.`)) return
    run(async () => {
      await adminFetch(`${contentVideoPath}/${item._id}`, { method: 'DELETE' })
      if (form?._id === item._id) setForm(null)
      setNotice('Video and uploaded files deleted.'); reload()
    })
  }
  return <section className="admin-page cc-admin"><span className="eyebrow">Content Creation only</span><h1>Course Videos</h1><p>Upload and manage recorded classes for the Content Creation internship.</p>{error && <div className="admin-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}<div className="admin-actions"><button className="admin-button dark" disabled={busy} onClick={() => edit(null)}>Upload Video</button><button className="admin-button light" disabled={busy || loading} onClick={() => { setError(''); reload() }}>Refresh</button></div>
    {form && <form ref={formRef} className="admin-editor" onSubmit={save}><h2>{form._id ? 'Edit video' : 'Upload Video'}</h2><fieldset disabled={busy}><div className="admin-form-grid"><label>Video Title<input autoFocus required maxLength="180" value={form.title} onChange={(event) => change('title', event.target.value)} /></label><label>Topic / Module<input required maxLength="120" value={form.module} onChange={(event) => change('module', event.target.value)} /></label><label className="admin-span">Short Description<textarea required rows="3" maxLength="1000" value={form.description} onChange={(event) => change('description', event.target.value)} /></label>{!form.hasVideo && <label>Video File<input type="file" required={!form.hasVideo} accept=".mp4,.webm,.mov" onChange={(event) => setVideo(event.target.files[0] || null)} /><small>MP4, WebM or MOV · up to 1 GB. MP4 (H.264/AAC) offers broad browser support.</small></label>}{!form.hasThumbnail && <label>Thumbnail (optional)<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => setThumbnail(event.target.files[0] || null)} /><small>JPG, PNG or WebP · up to 5 MB.</small></label>}<label>Publish Date (your local time)<input type="datetime-local" required value={form.publishDate} onChange={(event) => change('publishDate', event.target.value)} /></label><label>Status<select value={form.status} onChange={(event) => change('status', event.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></label></div>{form.hasVideo && <p>The recording is uploaded. You can edit its details here.</p>}<div className="admin-actions"><button className="admin-button dark" type="submit">{busy ? 'Saving...' : 'Save Video'}</button><button className="admin-button light" type="button" onClick={() => setForm(null)}>Close editor</button></div></fieldset>{busy && <div className="cc-upload-progress" role="status">{progress ? <><label htmlFor="cc-upload-progress">{progress.label}: {progress.percent}% {progress.percent === 100 ? '— validating and saving...' : 'uploaded'}</label><progress id="cc-upload-progress" value={progress.percent} max="100" /><button className="admin-button light" type="button" onClick={() => uploadController.current?.abort()}>Cancel upload</button></> : 'Saving video details...'}</div>}</form>}
    {loading ? <p role="status">Loading videos...</p> : <div className="cc-admin-list">{!items.length && <p>No Content Creation videos yet. Upload your first recorded class.</p>}{items.map((item, index) => <article className="cc-admin-row" key={item._id}><div><span className="eyebrow">{item.module}</span><h2>{item.title}</h2><p>{item.hasVideo ? item.status === 'published' && new Date(item.publishDate) > new Date() ? 'Scheduled' : item.status : 'Draft · upload incomplete'} · {new Date(item.publishDate).toLocaleString()}</p></div><div className="admin-actions"><button className="admin-button light" disabled={busy} onClick={() => edit(item)}>Edit</button><button className="admin-button light" disabled={busy || !item.hasVideo} onClick={() => openPreview(item)}>Preview</button><button className="admin-button light" disabled={busy || !item.hasVideo} onClick={() => toggle(item)}>{item.status === 'published' ? 'Unpublish' : 'Publish'}</button><button className="admin-button light" disabled={busy || index === 0} aria-label={`Move ${item.title} up`} onClick={() => move(index, -1)}>Move up</button><button className="admin-button light" disabled={busy || index === items.length - 1} aria-label={`Move ${item.title} down`} onClick={() => move(index, 1)}>Move down</button><button className="admin-button danger" disabled={busy} onClick={() => remove(item)}>Delete</button></div></article>)}</div>}{preview && <ContentVideoPlayer key={preview.item._id} {...preview} onClose={() => setPreview(null)} />}
  </section>
}
