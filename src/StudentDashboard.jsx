import { StudentLearningProgress } from './StudentLearning'
import { useSite } from './site-context'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Video } from 'lucide-react'
import { studentFetch } from './student-api'
import { useStudentSession } from './student-session-context'
import { RecordedClasses } from './ContentCreation'
import { TodayTechUpdate } from './TechNews'

export function StudentDashboard({ internshipOnly = false }) {
  const { settings, domains } = useSite()
  const { student } = useStudentSession()
  const track = domains.find(item => item.name === student.internshipDomain)
  const [state, setState] = useState({ data: null, error: '' })
  const [attempt, setAttempt] = useState(0)
  const liveClassUrl = student.internshipDomain === 'Cyber Security' ? state.data?.liveClassUrl : track?.meetingUrl
  useEffect(() => {
    let active = true
    studentFetch('/student/dashboard').then((data) => { if (active) setState({ data, error: '' }) }).catch((error) => { if (active) setState({ data: null, error: error.message }) })
    return () => { active = false }
  }, [attempt, student.studentId])
  return <section className="section container student-dashboard">
    <div className="student-welcome-banner"><span className="eyebrow">{internshipOnly ? 'My Internship' : 'Student Dashboard'}</span><h1>{internshipOnly ? student.internshipDomain : `Welcome, ${student.fullName}`}</h1><p>Your learning journey with Innovix Projects.</p><div className="student-welcome-orbit" aria-hidden="true"><span>LEARN</span><b>i</b><span>BUILD / GROW</span></div></div>
    <nav className="student-dashboard-nav" aria-label="Student navigation"><Link to="/student">Dashboard</Link><Link to="/student/internship">My Internship</Link>{settings.tasksEnabled && <Link to="/student/tasks">My Tasks</Link>}{settings.certificateVerificationEnabled && <Link to="/student/certificates">My Certificates</Link>}{settings.newsEnabled && settings.techNewsEnabled && <Link to="/tech-news">Daily Tech News</Link>}</nav>
    <dl className="student-info-grid"><div><dt>Student ID</dt><dd>{student.studentId}</dd></div><div><dt>Internship Domain</dt><dd>{student.internshipDomain}</dd></div><div><dt>College / Institution</dt><dd>{student.college}</dd></div><div><dt>Course / Year</dt><dd>{student.course} · {student.yearOfStudy}</dd></div></dl>
    {state.error && <div role="alert"><p>{state.error}</p><button className="button button-outline" onClick={() => { setState({ data: null, error: '' }); setAttempt((value) => value + 1) }}>Retry</button></div>}
    {!state.data && !state.error && <p role="status">Loading your learning space...</p>}
    {state.data && <>
      <div className="student-status"><b>Internship Status: {state.data.internshipStatus}</b><p>{state.data.internshipStatusNote}</p><a className="text-link" href="/internships#internship-application">View internship application <ArrowRight size={14} /></a></div>
      <div className="student-resource-grid">
        <article><Video size={23} /><h2>{track?.classTitle || 'Live Class'}</h2>{track?.date && <p>{track.date} {track.startTime}</p>}{track?.description && <p>{track.description}</p>}<p>Join your {student.internshipDomain} learning session.</p>{track?.liveClassEnabled && track.classActive && liveClassUrl ? <a className="button button-dark" href={liveClassUrl} target="_blank" rel="noopener noreferrer">Join Live Class</a> : <p>Your domain’s live-class link will appear when available.</p>}</article>
        <article><BookOpen size={23} /><h2>Recorded Classes</h2><p>Review lessons at your own pace.</p>{track?.recordedClassesEnabled ? <Link className="button button-outline" to="/student/recorded-classes">View Recorded Classes</Link> : <p>Recorded classes are currently unavailable for your domain.</p>}</article>
        {settings.newsEnabled && settings.techNewsEnabled && <article><BookOpen size={23} /><h2>Daily Tech News</h2><p>Explore technology updates and career insights curated for interns.</p><Link className="button button-outline" to="/tech-news">Read Daily Tech News</Link></article>}
        <article><BookOpen size={23} /><h2>Learning Progress</h2><p>Track your batch, assignments, completed learning and certificate requirements below.</p><a className="text-link" href="#learning-progress">View Progress</a></article>
      </div>
      <StudentLearningProgress /><TodayTechUpdate />
    </>}
  </section>
}

export function StudentRecordedClasses() {
  const { domains } = useSite()
  const { student } = useStudentSession()
  const track = domains.find(item => item.name === student.internshipDomain)
  const navigate = useNavigate()
  const supportedDomain = ['Content Creation', 'Cyber Security'].includes(student.internshipDomain)
  return <section className="section container student-dashboard"><span className="eyebrow">{student.internshipDomain}</span><h1>Recorded Classes</h1><Link className="back-link" to="/student">← Back to Dashboard</Link>{supportedDomain && track?.recordedClassesEnabled ? <RecordedClasses domain={student.internshipDomain} onClose={() => navigate('/student')} /> : <p>Recorded classes are currently unavailable for your domain.</p>}</section>
}
