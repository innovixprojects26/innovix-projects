import { useLearning } from './learning-api'
import { LearningState } from './learning-ui'
const labels = { totalStudents: 'Total Students', activeStudents: 'Active Students', activeBatches: 'Active Internship Batches', pendingApplications: 'Pending Applications', tasksAssigned: 'Tasks Assigned', pendingReviews: 'Pending Reviews', certificatesIssued: 'Certificates Issued', projectEnquiries: 'Project Enquiries', unreadMessages: 'Unread Messages', publishedNews: 'Published News', recordedVideos: 'Recorded Videos' }
const charts = { registrations: 'Student Registrations Over Time', domains: 'Students by Internship Domain', applications: 'Applications by Status', enquiries: 'Project Enquiry Trends', completion: 'Submission Review Status', batches: 'Batch Enrollment' }
export function LearningAnalytics({ compact = false }) {
  const state = useLearning('/analytics', true)
  return <section className="learning-page"><h2>Learning & Business Analytics</h2><LearningState state={state} />{state.data && <><div className="learning-stats">{Object.entries(labels).filter(([key]) => !compact || ['activeBatches', 'pendingApplications', 'tasksAssigned', 'pendingReviews', 'certificatesIssued'].includes(key)).map(([key, label]) => <article key={key}><span>{label}</span><strong>{state.data.counts[key]}</strong></article>)}</div><p className="learning-caption">Tasks Assigned counts published task definitions. Trend charts cover the last six months; all other totals reflect saved records.</p><div className="learning-columns">{Object.entries(charts).map(([key, label]) => <CountChart key={key} title={label} items={state.data.charts[key]} />)}</div></>}</section>
}
export function CountChart({ title, items }) {
  const max = Math.max(1, ...items.map(item => item.count))
  return <figure className="learning-card learning-chart"><figcaption>{title}</figcaption>{items.length ? items.map((item, i) => <div key={`${item._id}-${i}`}><span>{item._id || 'Unspecified'}</span><meter min="0" max={max} value={item.count} aria-label={`${item._id}: ${item.count}`} /><b>{item.count}</b></div>) : <p>No data yet.</p>}</figure>
}
