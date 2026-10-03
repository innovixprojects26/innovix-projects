import { BatchAdmin } from './BatchAdmin'
import { TaskAdmin, SubmissionsAdmin } from './TaskAdmin'
import { CertificatesAdmin } from './CertificatePages'
import { NotificationsAdmin, GamificationAdmin } from './EngagementAdmin'
import { LeadsAdmin } from './LeadsAdmin'
import { LearningAnalytics } from './LearningAnalytics'
import { DiscoverAdmin } from './DiscoverAdmin'
import { ConfigurationAdmin, InternshipAdmin, StudentsAdmin, AnnouncementsAdmin, AdminSettings } from './ManagementAdmin'
import './management.css'
import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, FileText, FolderKanban, LogOut, Menu, MessageSquare, Shield, Users, X } from 'lucide-react'
import { adminFetch, apiFetch, getAdminToken } from './api'
import { Logo, Price } from './components'
import { ThemeSelector } from './ThemeSelector'
import { TechNewsAdmin } from './TechNewsAdmin'
import { ContentVideoAdmin } from './ContentVideoAdmin'
import { resolveInternationalPhone } from '../shared/phone'

function phoneLabel(record) {
  const parsed = resolveInternationalPhone(record)
  return parsed ? parsed.formatInternational() : record.phone ? `${record.phone} (country code unavailable)` : '—'
}
import './admin.css'
import './admin-enhancements.css'

const enquiryStatuses = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Completed', 'Closed']
const customStatuses = ['New', 'Reviewing', 'Accepted', 'Contacted', 'Requirements Collected', 'Quoted', 'In Progress', 'Completed', 'Closed']
const internshipStatuses = ['New', 'Reviewed', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Joined', 'Completed']
const emptyProject = { title: '', slug: '', description: '', fullDescription: '', domain: '', level: 'Beginner', projectType: 'Mini Project', image: '', demoUrl: '', technologies: '', features: '', modules: '', requirements: '', problemStatement: '', objectives: '', price: 2999, published: false, available: true, visibleWhenUnavailable: true, featured: false, trending: false, popular: false, newProject: false }
const emptyTestimonial = { studentName: '', course: '', college: '', project: '', review: '', avatarUrl: '', published: false }
const dateText = (value) => value ? new Date(value).toLocaleString() : '—'
const slugify = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function AdminLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiFetch('/admin/login', { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem('innovix_admin_token', data.token)
      navigate('/admin', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }
  return <main className="admin-login"><div className="admin-login-theme"><ThemeSelector /></div><div className="admin-login-card"><Logo /><span className="eyebrow">Secure workspace</span><h1>Welcome to Innovix Admin.</h1><p>Manage projects, enquiries, and student support from one place.</p><form onSubmit={submit}><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><button className="admin-button dark" disabled={submitting}>{submitting ? 'Logging in...' : 'Log in'} <ArrowRight size={16} /></button>{error && <div className="admin-error" role="alert">{error}</div>}</form></div></main>
}

function AdminLayout() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const groups = [
    ['Overview', [['/admin', 'Dashboard', BarChart3]]],
    ['Website Management', [['/admin/projects', 'Projects', FolderKanban], ['/admin/internship-domains', 'Internships', Users], ['/admin/live-classes', 'Live Classes', FileText], ['/admin/content-creation/videos', 'Recorded Classes', FileText], ['/admin/tech-news', 'Daily Tech News', FileText], ['/admin/discover', 'Learn & Discover', FileText], ['/admin/testimonials', 'Testimonials', Shield]]],
    ['Student Management', [['/admin/students', 'Students', Users], ['/admin/applications', 'Internship Applications', Users]]],
    ['Internship Learning', [['/admin/batches', 'Batches', Users], ['/admin/tasks', 'Tasks & Assignments', FileText], ['/admin/submissions', 'Submissions', FileText], ['/admin/certificates', 'Certificates', Shield]]],
    ['Engagement', [['/admin/notifications', 'Notifications', MessageSquare], ['/admin/gamification', 'Gamification', BarChart3]]],
    ['Customer Management', [['/admin/enquiries', 'Project Enquiries / Leads', MessageSquare], ['/admin/custom-projects', 'Custom Project Requests', FileText], ['/admin/messages', 'Contact Messages', MessageSquare]]],
    ['Content Management', [['/admin/homepage', 'Homepage Content', FileText], ['/admin/services', 'Services', FileText], ['/admin/announcements', 'Announcements', FileText]]],
    ['System', [['/admin/website-settings', 'Website Settings', Shield], ['/admin/settings', 'Admin Settings', Shield]]],
  ]
  if (!getAdminToken()) return <Navigate to="/admin/login" replace />
  const logout = () => { localStorage.removeItem('innovix_admin_token'); navigate('/admin/login', { replace: true }) }
  return <div className="admin-shell">
    {open && <button className="admin-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={open ? 'admin-sidebar open' : 'admin-sidebar'}><div className="admin-brand"><Logo /><button onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div><nav aria-label="Admin navigation">{groups.map(([group, links]) => <div key={group}><p className="admin-nav-group">{group}</p>{links.map(([href, label, Icon]) => <NavLink end to={href} onClick={() => setOpen(false)} key={href} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={17} />{label}</NavLink>)}</div>)}</nav><button className="admin-logout" onClick={logout}><LogOut size={17} /> Log out</button></aside>
    <div className="admin-main"><header className="admin-topbar"><button className="admin-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><span>Innovix control room</span><ThemeSelector /><Link to="/">View site <ArrowRight size={15} /></Link></header><Routes><Route path="/batches" element={<BatchAdmin />} /><Route path="/tasks" element={<TaskAdmin />} /><Route path="/submissions" element={<SubmissionsAdmin />} /><Route path="/certificates" element={<CertificatesAdmin />} /><Route path="/notifications" element={<NotificationsAdmin />} /><Route path="/gamification" element={<GamificationAdmin />} /><Route path="/discover" element={<DiscoverAdmin />} /><Route path="/website-settings" element={<ConfigurationAdmin section="settings" />} /><Route path="/homepage" element={<ConfigurationAdmin section="homepage" />} /><Route path="/services" element={<ConfigurationAdmin section="services" />} /><Route path="/internship-domains" element={<InternshipAdmin />} /><Route path="/live-classes" element={<InternshipAdmin live />} /><Route path="/students" element={<StudentsAdmin />} /><Route path="/announcements" element={<AnnouncementsAdmin />} /><Route path="/settings" element={<AdminSettings />} /><Route path="/content-creation/videos" element={<ContentVideoAdmin />} /><Route path="/tech-news" element={<TechNewsAdmin />} /><Route path="/" element={<Dashboard />} /><Route path="/projects" element={<AdminProjects />} /><Route path="/enquiries" element={<LeadsAdmin />} /><Route path="/custom-projects" element={<RequestsPage type="custom" />} /><Route path="/applications" element={<RequestedInternships />} /><Route path="/internships" element={<RequestedInternships />} /><Route path="/messages" element={<Messages />} /><Route path="/testimonials" element={<TestimonialsAdmin />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes></div>
  </div>
}

function useAdminData(path, fallback = []) {
  const [state, setState] = useState({ loading: true, data: fallback, error: '' })
  const reload = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try { const data = await adminFetch(path); setState({ loading: false, data, error: '' }) }
    catch (error) { setState((previous) => ({ ...previous, loading: false, error: error.message })) }
  }, [path])
  useEffect(() => {
    let active = true
    adminFetch(path).then((data) => { if (active) setState({ loading: false, data, error: '' }) }).catch((error) => { if (active) setState((previous) => ({ ...previous, loading: false, error: error.message })) })
    return () => { active = false }
  }, [path])
  return { ...state, reload }
}

function AdminPage({ title, eyebrow, children }) { return <section className="admin-page"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{children}</section> }
function LoadState({ loading, error, retry }) { return <>{loading && <div className="admin-empty" role="status">Loading...</div>}{error && <div className="admin-error" role="alert">{error} <button className="admin-button light" onClick={retry}>Retry</button></div>}</> }
function Empty({ children }) { return <div className="admin-empty">{children}</div> }

function Dashboard() {
  const { loading, data, error, reload } = useAdminData('/dashboard', {})
  const stats = [['Available Projects', data.availableProjects, FolderKanban], ['Unavailable Projects', data.unavailableProjects, FolderKanban], ['Total Students', data.totalStudents, Users], ['Active Students', data.activeStudents, Users], ['Published News', data.publishedNews, FileText], ['Recorded Videos', data.recordedVideos, FileText], ['Total Projects', data.projects, FolderKanban], ['Published Projects', data.publishedProjects, FolderKanban], ['Project Enquiries', data.totalEnquiries, MessageSquare], ['New Enquiries', data.enquiries, MessageSquare], ['Custom Project Requests', data.customProjects, FileText], ['Internship Applications', data.internships, Users], ['Contact Messages', data.totalMessages, MessageSquare], ['Unread Messages', data.unreadMessages, MessageSquare], ['Testimonials', data.totalTestimonials, Shield], ['Published Testimonials', data.publishedTestimonials, Shield]]
  const actions = [['Manage Tech News', '/admin/tech-news'], ['Add Project', '/admin/projects'], ['View Enquiries', '/admin/enquiries'], ['View Custom Projects', '/admin/custom-projects'], ['View Internship Applications', '/admin/internships'], ['View Messages', '/admin/messages'], ['Manage Testimonials', '/admin/testimonials']]
  return <AdminPage title="Dashboard" eyebrow="Today at Innovix"><div className="admin-stats">{stats.map(([label, value, Icon]) => <div className="stat-card" key={label}><Icon size={19} /><span>{label}</span><b>{loading ? '—' : value ?? '—'}</b></div>)}</div><LoadState loading={loading} error={error} retry={reload} /><LearningAnalytics compact /><section className="admin-quick-actions"><h2>Quick actions</h2><div>{actions.map(([label, path]) => <Link to={path} key={path}>{label} <ArrowRight size={14} /></Link>)}</div></section><section className="admin-activity"><h2>Recent activity</h2>{!loading && !error && (data.recentActivity?.length ? <div className="admin-activity-list">{data.recentActivity.map((item) => <Link to={item.path} key={item.id}><span><b>{item.type}</b>{item.label}</span><time>{dateText(item.createdAt)}</time></Link>)}</div> : <Empty>New student activity will appear here.</Empty>)}</section></AdminPage>
}
function ProjectForm({ project, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => project ? { available: true, visibleWhenUnavailable: true, featured: false, ...project, technologies: (project.technologies || []).join('\n'), features: (project.features || []).join('\n'), modules: (project.modules || []).join('\n'), requirements: (project.requirements || []).join('\n'), objectives: (project.objectives || []).join('\n') } : { ...emptyProject })
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  const submit = (event) => { event.preventDefault(); onSave({ ...form, published: event.nativeEvent.submitter?.value === 'draft' ? false : event.nativeEvent.submitter?.value === 'publish' ? true : form.published, slug: slugify(form.slug || form.title), price: Number(form.price), ...Object.fromEntries(['technologies', 'features', 'modules', 'requirements', 'objectives'].map((key) => [key, form[key].split('\n').map((item) => item.trim()).filter(Boolean)])) }) }
  return <form className="admin-editor" onSubmit={submit}><h2>{project ? 'Edit project' : 'Add project'}</h2><p>Default price: ₹2,999. You can edit it below.</p><div className="admin-form-grid">
    <label>Title<input value={form.title} onChange={(event) => change('title', event.target.value)} required maxLength="160" /></label>
    <label>Slug<input value={form.slug} onChange={(event) => change('slug', event.target.value)} placeholder="Generated from title if blank" /></label>
    <label>Domain<input value={form.domain} onChange={(event) => change('domain', event.target.value)} required /></label>
    <label>Level<select value={form.level} onChange={(event) => change('level', event.target.value)}>{['Beginner', 'Intermediate', 'Advanced'].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Project type<select value={form.projectType} onChange={(event) => change('projectType', event.target.value)}>{['Mini Project', 'Final Year Project', 'Real-Time Project'].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Image URL<input type="url" value={form.image || ''} onChange={(event) => change('image', event.target.value)} /></label>
    <label>Demo URL (optional)<input type="url" value={form.demoUrl || ''} onChange={(event) => change('demoUrl', event.target.value)} /></label>
    <label>Price (₹)<input type="number" min="0" step="0.01" value={form.price ?? 2999} onChange={(event) => change('price', event.target.value)} required /></label>
    <label className="admin-span">Short description<textarea value={form.description} onChange={(event) => change('description', event.target.value)} required maxLength="500" rows="2" /></label>
    <label className="admin-span">Full description<textarea value={form.fullDescription || ''} onChange={(event) => change('fullDescription', event.target.value)} rows="3" /></label>
    <label>Technologies (one per line)<textarea value={form.technologies} onChange={(event) => change('technologies', event.target.value)} rows="4" /></label>
    <label>Features (one per line)<textarea value={form.features} onChange={(event) => change('features', event.target.value)} rows="4" /></label>
    <label>Modules (one per line)<textarea value={form.modules} onChange={(event) => change('modules', event.target.value)} rows="4" /></label>
    <label>Requirements (one per line)<textarea value={form.requirements} onChange={(event) => change('requirements', event.target.value)} rows="4" /></label>
    <label>Objectives (one per line)<textarea value={form.objectives} onChange={(event) => change('objectives', event.target.value)} rows="4" /></label>
    <label className="admin-span">Problem statement<textarea value={form.problemStatement || ''} onChange={(event) => change('problemStatement', event.target.value)} rows="3" /></label>
  </div><div className="admin-checks">{[['published', 'Published'], ['available', 'Available'], ['visibleWhenUnavailable', 'Keep visible when unavailable'], ['featured', 'Featured'], ['trending', 'Trending'], ['popular', 'Popular'], ['newProject', 'New project']].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => change(key, event.target.checked)} />{label}</label>)}</div><div className="admin-actions"><button className="admin-button dark" disabled={saving}>{saving ? 'Saving...' : project ? 'Update project' : 'Save project'}</button><button type="submit" value="draft" className="admin-button light" disabled={saving}>Save Draft</button><button type="submit" value="publish" className="admin-button light" disabled={saving}>Publish</button><button type="button" className="admin-button light" onClick={onCancel}>Cancel</button></div></form>
}

function AdminProjects() {
  const { loading, data, error, reload } = useAdminData('/projects')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const filtered = data.filter((item) => [item.title, item.slug, item.domain, ...(item.technologies || [])].join(' ').toLowerCase().includes(query.toLowerCase()))
  const save = async (payload) => { setSaving(true); setMessage(''); try { await adminFetch(editing ? `/projects/${editing._id}` : '/projects', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) }); setShowForm(false); setEditing(null); setMessage('Project saved.'); await reload() } catch (requestError) { setMessage(requestError.message) } finally { setSaving(false) } }
  const toggle = async (item, key = 'published') => { setMessage(''); try { await adminFetch(`/projects/${item._id}`, { method: 'PATCH', body: JSON.stringify({ [key]: key === 'available' ? item.available === false : !item[key] }) }); await reload() } catch (requestError) { setMessage(requestError.message) } }
  const remove = async (item) => { if (!window.confirm(`Delete "${item.title}" permanently?`)) return; setMessage(''); try { await adminFetch(`/projects/${item._id}`, { method: 'DELETE' }); setMessage('Project deleted.'); await reload() } catch (requestError) { setMessage(requestError.message) } }
  return <AdminPage title="Projects" eyebrow="Catalog management">{preview && <section className="admin-editor management-preview"><h2>Preview: {preview.title}</h2><p>{preview.fullDescription || preview.description}</p><Price amount={preview.price} />{['features', 'modules', 'requirements', 'objectives'].map(key => <div key={key}><h3>{key}</h3><ul>{(preview[key] || []).map((value, i) => <li key={i}>{value}</li>)}</ul></div>)}<p>{preview.problemStatement}</p><button className="admin-button light" onClick={() => setPreview(null)}>Close preview</button></section>}<div className="admin-toolbar"><span>{data.length} projects</span><button className="admin-button dark" onClick={() => { setEditing(null); setShowForm(true); setMessage('') }}>New Project</button></div><input className="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, slug, domain, or technology" aria-label="Search projects" />{message && <div className="admin-notice" role="status">{message}</div>}{showForm && <ProjectForm key={editing?._id || 'new'} project={editing} onSave={save} onCancel={() => setShowForm(false)} saving={saving} />}<LoadState loading={loading} error={error} retry={reload} />{!loading && !error && (filtered.length ? <div className="admin-project-grid">{filtered.map((item) => <article className="admin-project-card" key={item._id}>{item.image && <img src={item.image} alt="" />}<div><span className="eyebrow">{item.domain}</span><h3>{item.title}</h3><p>{item.description}</p><div className="admin-project-meta"><Price amount={item.price} /><span className={item.published ? 'status live' : 'status'}>{item.published ? 'Published' : 'Draft'}</span></div><div className="admin-card-actions"><button onClick={() => { setEditing(item); setShowForm(true); setMessage('') }}>Edit</button><button onClick={() => setPreview(item)}>Preview</button>{['available', 'featured', 'trending', 'popular'].map(key => <button key={key} role="switch" aria-checked={key === 'available' ? item[key] !== false : Boolean(item[key])} onClick={() => toggle(item, key)}>{key === 'available' ? 'Project availability' : key[0].toUpperCase() + key.slice(1)}: {(key === 'available' ? item[key] !== false : item[key]) ? 'ON' : 'OFF'}</button>)}<button onClick={() => toggle(item)}>{item.published ? 'Unpublish' : 'Publish'}</button>{item.published && <Link to={`/projects/${item.slug}`} target="_blank" rel="noopener noreferrer">View public</Link>}<button onClick={() => remove(item)}>Delete</button></div></div></article>)}</div> : <Empty>{query ? 'No projects match your search.' : 'No projects yet. Add the first one above.'}</Empty>)}</AdminPage>
}

function ContactActions({ email, record }) {
  const safeEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  const international = resolveInternationalPhone(record)
  const digits = international?.number.slice(1)
  return <div className="admin-contact-actions">{safeEmail && <a href={`mailto:${safeEmail}`}>Email</a>}{digits && <><a href={`tel:${international.number}`}>Call</a><a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}{record?.phone && !digits && <span>Country code unavailable; confirm the number before calling or using WhatsApp.</span>}</div>
}

function EnquiryContactActions({ record }) {
  const international = resolveInternationalPhone(record)
  const digits = international?.number.slice(1)
  const safeEmail = typeof record.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ? record.email : null
  const [message, setMessage] = useState(() => `Hi ${record.studentName || 'there'}, I'm following up on your enquiry about ${record.projectTitle || 'your selected project'}.`)
  return <div className="admin-enquiry-contact">
    {digits && <label>WhatsApp message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows="2" /></label>}
    <div className="admin-contact-actions">
      {safeEmail && <a href={`mailto:${safeEmail}`}>Email</a>}
      {digits && <><a href={`tel:${international.number}`}>Call</a><a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
      {record.phone && !digits && <span>Country code unavailable; confirm the number before calling or using WhatsApp.</span>}
    </div>
  </div>
}

function CustomContactActions({ record }) {
  const international = resolveInternationalPhone(record)
  const digits = international?.number.slice(1)
  const safeEmail = typeof record.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ? record.email : null
  const [message, setMessage] = useState(() => `Hi ${record.studentName || 'there'},\n\nThank you for contacting Innovix Projects regarding your custom project "${record.projectIdea || 'your idea'}".\n\nWe would like to discuss your requirements with you.\n\nRegards,\nInnovix Projects`)
  return <div className="admin-enquiry-contact">
    {digits && <label>WhatsApp message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows="7" /></label>}
    <div className="admin-contact-actions">
      {safeEmail && <a href={`mailto:${safeEmail}`}>Email</a>}
      {digits && <><a href={`tel:${international.number}`}>Call</a><a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
      {record.phone && !digits && <span>Country code unavailable; confirm the number before calling or using WhatsApp.</span>}
    </div>
  </div>
}

function safeExternalUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null }
  catch { return null }
}

function InternshipContactActions({ record }) {
  const international = resolveInternationalPhone(record)
  const digits = international?.number.slice(1)
  const safeEmail = typeof record.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ? record.email : null
  const [message, setMessage] = useState(() => `Hi ${record.name || 'there'},\n\nThank you for applying for the ${record.domain || 'selected'} internship opportunity at Innovix Projects.\n\nWe are contacting you regarding your application.\n\nRegards,\nInnovix Projects`)
  return <div className="admin-enquiry-contact">
    {digits && <label>WhatsApp message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows="7" /></label>}
    <div className="admin-contact-actions">
      {safeEmail && <a href={`mailto:${safeEmail}`}>Email</a>}
      {digits && <><a href={`tel:${international.number}`}>Call</a><a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
      {record.phone && !digits && <span>Country code unavailable; confirm the number before calling or using WhatsApp.</span>}
    </div>
  </div>
}

function RequestsPage({ type }) {
  const config = {
    enquiries: { title: 'Enquiries', path: '/enquiries', status: enquiryStatuses },
    custom: { title: 'Custom Project Requests', path: '/custom', status: customStatuses },
    internships: { title: 'Student Applications', path: '/internships', status: internshipStatuses },
  }[type]
  const { loading, data, error, reload } = useAdminData(config.path)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const rows = data.filter(item => (!statusFilter || item.status === statusFilter) && [item.studentName, item.name, item.email, item.domain, item.projectTitle, item.projectIdea, item.college, item.phone].join(' ').toLowerCase().includes(search.toLowerCase()))
  const [actionError, setActionError] = useState('')
  const [updating, setUpdating] = useState(null)
  const update = async (item, status) => { setUpdating(item._id); setActionError(''); try { await adminFetch(`${config.path}/${item._id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reload() } catch (requestError) { setActionError(requestError.message) } finally { setUpdating(null) } }
  return <AdminPage title={config.title} eyebrow="Student support"><div className="admin-toolbar"><input className="admin-search" aria-label="Search records" placeholder="Search name, email, domain, project or college" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{[...new Set([...config.status, ...data.map(item => item.status)])].map(value => <option key={value}>{value}</option>)}</select></div><LoadState loading={loading} error={error} retry={reload} />{actionError && <div className="admin-error" role="alert">{actionError}</div>}{!loading && !error && (rows.length ? <div className="admin-record-list">{rows.map((item) => <article className="admin-record" key={item._id}><div className="admin-record-head"><div><span className="eyebrow">{type === 'enquiries' ? 'Project enquiry' : type === 'custom' ? 'Custom project' : item.status === 'New' ? 'NEW APPLICATION' : 'Internship'}</span><h2>{item.studentName || item.name}</h2><time>Submitted {dateText(item.createdAt)}</time></div><label>Status<select aria-label={`Status for ${item.studentName || item.name}`} value={item.status} disabled={updating === item._id} onChange={(event) => update(item, event.target.value)}>{[...new Set([...config.status, ...data.map(item => item.status)])].map(value => <option key={value}>{value}</option>)}</select></label></div><dl className="admin-details"><div><dt>Email</dt><dd>{item.email || '—'}</dd></div><div><dt>Country code + phone number</dt><dd>{phoneLabel(item)}</dd></div><div><dt>Degree / Course</dt><dd>{item.degreeCourse || '—'}</dd></div><div><dt>College</dt><dd>{item.college || '—'}</dd></div>{type === 'enquiries' && <><div><dt>Selected project</dt><dd>{item.projectTitle || '—'}</dd></div><div><dt>Price</dt><dd>{item.projectPrice != null || item.project?.price != null ? <Price amount={item.projectPrice ?? item.project.price} /> : '—'}</dd></div><div className="admin-wide"><dt>Message / Requirement</dt><dd>{item.message || '—'}</dd></div></>}{type === 'custom' && <><div><dt>Project idea</dt><dd>{item.projectIdea || '—'}</dd></div><div><dt>Project domain</dt><dd>{item.domain || '—'}</dd></div><div><dt>Preferred technology</dt><dd>{item.preferredTechnology || '—'}</dd></div><div><dt>Expected completion date</dt><dd>{item.deadline ? new Date(item.deadline).toLocaleDateString() : '—'}</dd></div><div><dt>Budget</dt><dd>{item.budget != null ? <Price amount={item.budget} /> : '—'}</dd></div><div className="admin-wide"><dt>Detailed requirements</dt><dd>{item.description || '—'}</dd></div></>}{type === 'internships' && <>
  {['Selected', 'Joined'].includes(item.status) && <div><dt>Batch enrollment</dt><dd><Link to={`/admin/batches?application=${item._id}`}>Assign to Batch</Link></dd></div>}
  <div><dt>Department / Major</dt><dd>{item.department || '—'}</dd></div>
  <div><dt>Current / graduation year</dt><dd>{item.studyYear || '—'}</dd></div>
  <div><dt>Applied role</dt><dd>{item.domain || '—'}</dd></div>
  <div><dt>Skills</dt><dd>{item.skills || '—'}</dd></div>
  <div><dt>Experience level</dt><dd>{item.experienceLevel || '—'}</dd></div>
  <div><dt>Availability</dt><dd>{item.availabilityDate ? new Date(item.availabilityDate).toLocaleDateString() : '—'}</dd></div>
  {[['Portfolio', 'portfolioUrl'], ['GitHub', 'githubUrl'], ['LinkedIn', 'linkedinUrl']].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{safeExternalUrl(item[key]) ? <a href={safeExternalUrl(item[key])} target="_blank" rel="noopener noreferrer">Open {label}</a> : item[key] ? 'Invalid URL' : '—'}</dd></div>)}
  <div className="admin-wide"><dt>Motivation / message</dt><dd>{item.message || '—'}</dd></div>
</>}</dl>{type === 'enquiries' ? <EnquiryContactActions record={item} /> : type === 'custom' ? <CustomContactActions record={item} /> : <InternshipContactActions record={item} />}</article>)}</div> : <Empty>No {config.title.toLowerCase()} yet. New submissions will appear here.</Empty>)}</AdminPage>
}

function RequestedInternships() {
  const { loading, data, error, reload } = useAdminData('/internships')
  const { data: batches, error: batchError } = useAdminData('/learning/batches')
  const [selectedBatches, setSelectedBatches] = useState({})
  const [actionError, setActionError] = useState('')
  const [updating, setUpdating] = useState(null)
  const rows = [...data].sort((a, b) => {
    const pending = item => ['Pending', 'New', 'Reviewed', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected'].includes(item.status)
    return Number(pending(b)) - Number(pending(a)) || new Date(b.createdAt) - new Date(a.createdAt)
  })
  const decide = async (item, decision) => {
    setUpdating(item._id)
    setActionError('')
    try {
      await adminFetch(`/internships/${item._id}/decision`, { method: 'PATCH', body: JSON.stringify({ decision, ...(decision === 'Approved' ? { batchId: selectedBatches[item._id] || eligibleBatches(item, batches)[0]?._id } : {}) }) })
      await reload()
    } catch (requestError) { setActionError(requestError.message) }
    finally { setUpdating(null) }
  }
  return <AdminPage title="Requested Internships" eyebrow="Student Management · Internship Applications">
    <p>Review existing applications. Approving requires a matching Student account and an eligible batch in the requested domain.</p>
    <LoadState loading={loading} error={error || batchError} retry={reload} />
    {actionError && <div className="admin-error" role="alert">{actionError}</div>}
    {!loading && !error && (rows.length ? <div className="admin-record-list">{rows.map(item => {
      const canDecide = ['Pending', 'New', 'Reviewed', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected'].includes(item.status)
      const available = eligibleBatches(item, batches)
      const batchId = selectedBatches[item._id] || (available.length === 1 ? String(available[0]._id) : '')
      return <article className={`admin-record ${canDecide ? 'unread' : ''}`} key={item._id}>
        <div className="admin-record-head"><div><span className="eyebrow">{canDecide ? 'NEW REQUEST' : 'INTERNSHIP APPLICATION'}</span><h2>{item.name}</h2><time>Submitted {dateText(item.createdAt)}</time></div><span className={`status ${item.status === 'Approved' || item.status === 'Joined' ? 'live' : ''}`}>{item.status}</span></div>
        <dl className="admin-details">
          <div><dt>Email</dt><dd>{item.email || '—'}</dd></div>
          <div><dt>Phone</dt><dd>{phoneLabel(item)}</dd></div>
          <div><dt>College</dt><dd>{item.college || '—'}</dd></div>
          <div><dt>Course</dt><dd>{item.degreeCourse || '—'}</dd></div>
          <div><dt>Year</dt><dd>{item.studyYear || '—'}</dd></div>
          <div><dt>Internship Domain</dt><dd>{item.domain || '—'}</dd></div>
        </dl>
        {canDecide && <div className="admin-card-actions">
          <label>Enrollment batch <select aria-label={`Enrollment batch for ${item.name}`} value={batchId} onChange={event => setSelectedBatches(previous => ({ ...previous, [item._id]: event.target.value }))}><option value="">Choose eligible batch</option>{available.map(batch => <option key={batch._id} value={batch._id}>{batch.name} · {batch.status} · {batch.enrollmentCount}/{batch.maxStudents}</option>)}</select></label>
          <button className="admin-button dark" disabled={updating === item._id || !batchId} onClick={() => decide(item, 'Approved')}>{updating === item._id ? 'Processing...' : 'Approve'}</button>
          <button className="admin-button light" disabled={updating === item._id} onClick={() => decide(item, 'Rejected')}>Reject</button>
        </div>}
        {item.status === 'Approved' && <p>Approved and assigned to a batch. Student learning access is enabled.</p>}
      </article>
    })}</div> : <Empty>No internship applications yet.</Empty>)}
  </AdminPage>
}

function eligibleBatches(application, batches) {
  return batches.filter(batch => batch.domain === application.domain && batch.enabled && ['Upcoming', 'Active'].includes(batch.status) && batch.enrollmentCount < batch.maxStudents)
}

function Messages() {
  const { loading, data, error, reload } = useAdminData('/messages/all')
  const [search, setSearch] = useState('')
  const [readFilter, setReadFilter] = useState('')
  const rows = data.filter(item => (!readFilter || (readFilter === 'read') === item.read) && [item.name, item.email, item.subject, item.message].join(' ').toLowerCase().includes(search.toLowerCase()))
  const [actionError, setActionError] = useState('')
  const toggle = async (item) => { setActionError(''); try { await adminFetch(`/messages/${item._id}/read`, { method: 'PATCH', body: JSON.stringify({ read: !item.read }) }); await reload() } catch (requestError) { setActionError(requestError.message) } }
  const remove = async (item) => { if (!window.confirm(`Delete the message from "${item.name}" permanently?`)) return; setActionError(''); try { await adminFetch(`/messages/${item._id}`, { method: 'DELETE' }); await reload() } catch (requestError) { setActionError(requestError.message) } }
  return <AdminPage title="Contact Messages" eyebrow="Inbox"><div className="admin-toolbar"><input className="admin-search" aria-label="Search messages" placeholder="Search name, email, subject or message" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Read status" value={readFilter} onChange={event => setReadFilter(event.target.value)}><option value="">All messages</option><option value="read">Read</option><option value="unread">Unread</option></select></div><LoadState loading={loading} error={error} retry={reload} />{actionError && <div className="admin-error" role="alert">{actionError}</div>}{!loading && !error && (rows.length ? <div className="message-list">{rows.map((item) => <article className={item.read ? 'message-card' : 'message-card unread'} key={item._id}><div><b>{item.name}</b><span>{item.email} · Submitted {dateText(item.createdAt)} · {item.read ? 'Read' : 'Unread'}</span>{item.phone && <span>Phone: {phoneLabel(item)}</span>}{item.subject && <span>Subject: {item.subject}</span>}{item.degreeCourse && <span>Degree / Course: {item.degreeCourse}</span>}<p>{item.message}</p><ContactActions email={item.email} record={item} /></div><div className="admin-message-actions"><button className="admin-button light" onClick={() => toggle(item)}>{item.read ? 'Mark unread' : 'Mark read'}</button><button className="admin-button light" onClick={() => remove(item)}>Delete</button></div></article>)}</div> : <Empty>No contact messages yet.</Empty>)}</AdminPage>
}
function TestimonialForm({ item, onSave, onCancel, saving }) {
  const [form, setForm] = useState(item || { ...emptyTestimonial })
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  return <form className="admin-editor" onSubmit={(event) => { event.preventDefault(); onSave(form) }}><h2>{item ? 'Edit testimonial' : 'Add testimonial'}</h2><div className="admin-form-grid"><label>Student name<input value={form.studentName} onChange={(event) => change('studentName', event.target.value)} required /></label><label>Course<input value={form.course || ''} onChange={(event) => change('course', event.target.value)} /></label><label>College<input value={form.college || ''} onChange={(event) => change('college', event.target.value)} /></label><label>Project<input value={form.project || ''} onChange={(event) => change('project', event.target.value)} /></label><label>Avatar URL<input type="url" value={form.avatarUrl || ''} onChange={(event) => change('avatarUrl', event.target.value)} /></label><label className="admin-span">Review<textarea value={form.review} onChange={(event) => change('review', event.target.value)} required rows="4" /></label></div><div className="admin-checks"><label><input type="checkbox" checked={Boolean(form.published)} onChange={(event) => change('published', event.target.checked)} />Published</label></div><div className="admin-actions"><button className="admin-button dark" disabled={saving}>{saving ? 'Saving...' : 'Save testimonial'}</button><button type="button" className="admin-button light" onClick={onCancel}>Cancel</button></div></form>
}

function TestimonialsAdmin() {
  const { loading, data, error, reload } = useAdminData('/testimonials/all')
  const [preview, setPreview] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const save = async (payload) => { setSaving(true); setMessage(''); try { await adminFetch(editing ? `/testimonials/${editing._id}` : '/testimonials', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) }); setShowForm(false); setEditing(null); setMessage('Testimonial saved.'); await reload() } catch (requestError) { setMessage(requestError.message) } finally { setSaving(false) } }
  const toggle = async (item) => { setMessage(''); try { await adminFetch(`/testimonials/${item._id}`, { method: 'PATCH', body: JSON.stringify({ published: !item.published }) }); await reload() } catch (requestError) { setMessage(requestError.message) } }
  const remove = async (item) => { if (!window.confirm(`Delete testimonial from "${item.studentName}" permanently?`)) return; setMessage(''); try { await adminFetch(`/testimonials/${item._id}`, { method: 'DELETE' }); setMessage('Testimonial deleted.'); await reload() } catch (requestError) { setMessage(requestError.message) } }
  return <AdminPage title="Testimonials" eyebrow="Social proof">{preview && <section className="admin-editor"><h2>Testimonial preview</h2><blockquote><p>{preview.review}</p><footer><b>{preview.studentName}</b><p>{preview.course} {preview.college}</p></footer></blockquote><button className="admin-button light" onClick={() => setPreview(null)}>Close preview</button></section>}<div className="admin-toolbar"><span>{data.length} testimonials</span><button className="admin-button dark" onClick={() => { setEditing(null); setShowForm(true); setMessage('') }}>Add testimonial</button></div>{message && <div className="admin-notice" role="status">{message}</div>}{showForm && <TestimonialForm key={editing?._id || 'new'} item={editing} onSave={save} onCancel={() => setShowForm(false)} saving={saving} />}<LoadState loading={loading} error={error} retry={reload} />{!loading && !error && (data.length ? <div className="admin-record-list">{data.map((item) => <article className="admin-record" key={item._id}><div className="admin-record-head"><div><h2>{item.studentName}</h2><span>{[item.course, item.college].filter(Boolean).join(' · ')}</span></div><span className={item.published ? 'status live' : 'status'}>{item.published ? 'Published' : 'Draft'}</span></div><p>{item.review}</p><div className="admin-card-actions"><button onClick={() => { setEditing(item); setShowForm(true); setMessage('') }}>Edit</button><button onClick={() => setPreview(item)}>Preview</button><button onClick={() => toggle(item)}>{item.published ? 'Unpublish' : 'Publish'}</button><button onClick={() => remove(item)}>Delete</button></div></article>)}</div> : <Empty>No testimonials yet. Add real student feedback when available.</Empty>)}</AdminPage>
}

export function AdminApp() { return <Routes><Route path="/login" element={<AdminLogin />} /><Route path="/*" element={<AdminLayout />} /></Routes> }
