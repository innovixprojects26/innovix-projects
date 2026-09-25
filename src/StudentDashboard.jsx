import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Video } from 'lucide-react'
import { studentFetch } from './student-api'
import { useStudentSession } from './student-session-context'
import { RecordedClasses } from './ContentCreation'

export function StudentDashboard({ internshipOnly = false }) {
  const { student } = useStudentSession()
  const [state, setState] = useState({ data: null, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    studentFetch('/student/dashboard').then((data) => { if (active) setState({ data, error: '' }) }).catch((error) => { if (active) setState({ data: null, error: error.message }) })
    return () => { active = false }
  }, [attempt, student.studentId])
  return <section className="section container student-dashboard"><span className="eyebrow">{internshipOnly ? 'My Internship' : 'Student Dashboard'}</span><h1>{internshipOnly ? student.internshipDomain : `Welcome, ${student.fullName}`}</h1><p>Your learning journey with Innovix Projects.</p><nav className="student-dashboard-nav" aria-label="Student navigation"><Link to="/student">Dashboard</Link><Link to="/student/internship">My Internship</Link><Link to="/tech-news">Daily Tech News</Link></nav><dl className="student-info-grid"><div><dt>Student ID</dt><dd>{student.studentId}</dd></div><div><dt>Internship Domain</dt><dd>{student.internshipDomain}</dd></div><div><dt>College / Institution</dt><dd>{student.college}</dd></div><div><dt>Course / Year</dt><dd>{student.course} · {student.yearOfStudy}</dd></div></dl>{state.error && <div role="alert"><p>{state.error}</p><button className="button button-outline" onClick={() => { setState({ data: null, error: '' }); setAttempt((value) => value + 1) }}>Retry</button></div>}{!state.data && !state.error && <p role="status">Loading your learning space...</p>}{state.data && <><div className="student-status"><b>Internship Status: {state.data.internshipStatus}</b><p>{state.data.internshipStatusNote}</p><a className="text-link" href="/internships#internship-application">View internship application <ArrowRight size={14} /></a></div><div className="student-resource-grid"><article><Video size={23} /><h2>Live Class</h2><p>Join your {student.internshipDomain} learning session.</p>{state.data.liveClassUrl ? <a className="button button-dark" href={state.data.liveClassUrl} target="_blank" rel="noopener noreferrer">Join Live Class</a> : <p>Your domain’s live-class link will appear when available.</p>}</article><article><BookOpen size={23} /><h2>Recorded Classes</h2><p>Review lessons at your own pace.</p>{state.data.recordedClassesAvailable ? <Link className="button button-outline" to="/student/recorded-classes">View Recorded Classes</Link> : <p>Recorded classes have not been added for your domain yet.</p>}</article><article><BookOpen size={23} /><h2>Daily Tech News</h2><p>Explore technology updates and career insights curated for interns.</p><Link className="button button-outline" to="/tech-news">Read Daily Tech News</Link></article><article><BookOpen size={23} /><h2>Learning Progress</h2><p>Progress tracking is not available yet. Continue learning through your live and recorded classes.</p></article></div></>}</section>
}

export function StudentRecordedClasses() {
  const { student } = useStudentSession()
  const navigate = useNavigate()
  return <section className="section container student-dashboard"><span className="eyebrow">{student.internshipDomain}</span><h1>Recorded Classes</h1><Link className="back-link" to="/student">← Back to Dashboard</Link>{student.internshipDomain === 'Content Creation' ? <RecordedClasses onClose={() => navigate('/student')} /> : <p>Recorded classes have not been added for your domain yet.</p>}</section>
}
