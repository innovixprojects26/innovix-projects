
import { StudentLearningProgress } from './StudentLearning'
import { sameInternshipDomain } from '../shared/internship-domain'
import { internshipDisplayName } from './approved-internships.js'
import { useSite } from './site-context'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Video, LockKeyhole } from 'lucide-react'
import { studentFetch } from './student-api'
import { useStudentSession } from './student-session-context'
import { RecordedClasses } from './ContentCreation'
import { TodayTechUpdate } from './TechNews'

const paymentUrl = (domain, next = 'dashboard') =>
  `/internships/${encodeURIComponent(domain)}?next=${encodeURIComponent(next)}#internship-payment`

function hasVerifiedTestPayment(data) {
  return (
    data?.paymentVerified === true &&
    data?.hasDomainAccess === true
  )
}

export function StudentDashboard({ internshipOnly = false }) {
  const { settings, domains } = useSite()
  const { student } = useStudentSession()

  const track = domains.find(item =>
    sameInternshipDomain(item.name, student.internshipDomain)
  )

  const [state, setState] = useState({
    data: null,
    error: ''
  })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    studentFetch('/student/dashboard')
      .then(data => {
        if (active) setState({ data, error: '' })
      })
      .catch(error => {
        if (active) {
          setState({
            data: null,
            error: error.message
          })
        }
      })

    return () => {
      active = false
    }
  }, [attempt, student.studentId])

  useEffect(() => {
    const refresh = () => {
      setAttempt(value => value + 1)
    }

    window.addEventListener(
      'innovix-learning-change',
      refresh
    )

    return () => {
      window.removeEventListener(
        'innovix-learning-change',
        refresh
      )
    }
  }, [])

  const data = state.data
  const paid = hasVerifiedTestPayment(data)

  const recordedAvailable =
    paid && Boolean(data?.recordedClassesAvailable)

  return (
    <section className="section container student-dashboard">
      <div className="student-welcome-banner">
        <span className="eyebrow">
          {internshipOnly
            ? 'My Internship'
            : 'Student Dashboard'}
        </span>

        <h1>
          {internshipOnly
            ? internshipDisplayName(student.internshipDomain)
            : `Welcome, ${student.fullName}`}
        </h1>

        <p>
          Your learning journey with Innovix Projects.
        </p>

        <div
          className="student-welcome-orbit"
          aria-hidden="true"
        >
          <span>LEARN</span>
          <b>i</b>
          <span>BUILD / GROW</span>
        </div>
      </div>

      <nav
        className="student-dashboard-nav"
        aria-label="Student navigation"
      >
        <Link to="/student">Dashboard</Link>

        <Link to="/student/internship">
          My Internship
        </Link>

        {settings.tasksEnabled && (
          <>
            <Link to="/student/tasks">
              My Tasks
            </Link>

            <Link to="/student/tasks?stage=Project">
              Final Projects
            </Link>
          </>
        )}

        {settings.certificateVerificationEnabled && (
          <Link to="/student/certificates">
            My Certificates
          </Link>
        )}

        {settings.newsEnabled &&
          settings.techNewsEnabled && (
            <Link to="/tech-news">
              Daily Tech News
            </Link>
          )}
      </nav>

      <dl className="student-info-grid">
        <div>
          <dt>Student ID</dt>
          <dd>{student.studentId}</dd>
        </div>

        <div>
          <dt>Internship Domain</dt>
          <dd>{internshipDisplayName(student.internshipDomain)}</dd>
        </div>

        <div>
          <dt>College / Institution</dt>
          <dd>
            {student.college}
          </dd>
        </div>

        <div>
          <dt>Course / Year</dt>
          <dd>
            {student.course} · {student.yearOfStudy}
          </dd>
        </div>
      </dl>

      {state.error && (
        <div role="alert">
          <p>{state.error}</p>

          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setState({ data: null, error: '' })
              setAttempt(value => value + 1)
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!data && !state.error && (
        <p role="status">
          Loading your learning space...
        </p>
      )}

      {data && (
        <>
          <div className="student-status">
            <b>
              Internship Status: {data.internshipStatus}
            </b>

            <p>{data.internshipStatusNote}</p>

            <p>
              Learning payment:{' '}
              <strong>
                {data.paymentVerified
                  ? 'TEST Payment Verified'
                  : 'Payment Pending'}
              </strong>
            </p>

            {!data.paymentVerified && (
              <Link
                className="button button-dark"
                to={paymentUrl(
                  student.internshipDomain,
                  'dashboard'
                )}
              >
                <LockKeyhole size={16} />
                Make Payment
              </Link>
            )}

            <a
              className="text-link"
              href="/internships#internship-application"
            >
              View internship application
              <ArrowRight size={14} />
            </a>
          </div>

          <div className="student-resource-grid">
            <StudentLiveClass
              domain={student.internshipDomain}
              liveClass={data.liveClass}
              liveClassUrl={
                paid ? data.liveClassUrl : null
              }
              fallbackTitle={track?.classTitle}
              paymentVerified={data.paymentVerified}
              domainAccess={data.hasDomainAccess}
              liveClassAvailable={Boolean(track?.active && track?.liveClassEnabled && track?.classActive)}
            />

            <article>
              <BookOpen size={23} />

              <h2>Recorded Classes</h2>

              <p>
                Review lessons at your own pace.
              </p>

              {recordedAvailable ? (
                <Link
                  className="button button-outline"
                  to="/student/recorded-classes"
                >
                  View Recorded Classes
                </Link>
              ) : !data.paymentVerified ? (
                <Link
                  className="button button-outline"
                  to={paymentUrl(
                    student.internshipDomain,
                    'recorded'
                  )}
                >
                  <LockKeyhole size={16} />
                  Unlock Recorded Classes
                </Link>
              ) : (
                <p>
                  Recorded classes are currently
                  unavailable for your domain.
                </p>
              )}
            </article>

            {settings.newsEnabled &&
              settings.techNewsEnabled && (
                <article>
                  <BookOpen size={23} />

                  <h2>Daily Tech News</h2>

                  <p>
                    Explore technology updates and
                    career insights curated for interns.
                  </p>

                  <Link
                    className="button button-outline"
                    to="/tech-news"
                  >
                    Read Daily Tech News
                  </Link>
                </article>
              )}

            <article>
              <BookOpen size={23} />

              <h2>Learning Progress</h2>

              <p>
                Track your batch, assignments,
                completed learning and certificate
                requirements below.
              </p>

              <a
                className="text-link"
                href="#learning-progress"
              >
                View Progress
              </a>
            </article>
          </div>

          {paid && <StudentLearningProgress />}
          <TodayTechUpdate />
        </>
      )}
    </section>
  )
}

export function StudentLiveClass({
  domain,
  liveClass,
  liveClassUrl,
  fallbackTitle = 'Live Class',
  paymentVerified = false,
  domainAccess = paymentVerified,
  liveClassAvailable = true
}) {
  return (
    <article>
      <Video size={23} />

      <h2>
        {liveClass?.title ||
          fallbackTitle ||
          'Live Class'}
      </h2>

      {liveClass?.date && (
        <p>
          {liveClass.date} {liveClass.startTime}
        </p>
      )}

      {liveClass?.description && (
        <p>{liveClass.description}</p>
      )}

      <p>
        Join your {internshipDisplayName(domain)} learning session.
      </p>

      {!paymentVerified ? (
        <>
          <p>Payment Pending</p>

          <Link
            className="button button-dark"
            to={paymentUrl(domain, 'live')}
          >
            <LockKeyhole size={16} />
            Join Live Class — Make Payment
          </Link>
        </>
      ) : !domainAccess ? (
        <p>Payment is verified, but internship access is unavailable. Contact Admin to review your batch and domain.</p>
      ) : liveClassUrl ? (
        <a
          className="button button-dark"
          href={liveClassUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Join Live Class
        </a>
      ) : !liveClassAvailable ? (
        <p>Live classes are currently unavailable for your domain.</p>
      ) : (
        <>
          <button
            type="button"
            className="button button-dark"
            disabled
          >
            Join Live Class
          </button>

          <p>
            Payment verified. Live class link
            will be updated soon.
          </p>
        </>
      )}
    </article>
  )
}

export function StudentRecordedClasses() {
  const { domains } = useSite()
  const { student } = useStudentSession()
  const navigate = useNavigate()

  const track = domains.find(item =>
    sameInternshipDomain(
      item.name,
      student.internshipDomain
    )
  )

  const [state, setState] = useState({
    data: null,
    error: ''
  })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    studentFetch('/student/dashboard')
      .then(data => {
        if (active) {
          setState({ data, error: '' })
        }
      })
      .catch(error => {
        if (active) {
          setState({
            data: null,
            error: error.message
          })
        }
      })

    return () => {
      active = false
    }
  }, [student.studentId, attempt])

  useEffect(() => {
    const refresh = () => {
      setAttempt(value => value + 1)
    }

    window.addEventListener(
      'innovix-learning-change',
      refresh
    )

    return () => {
      window.removeEventListener(
        'innovix-learning-change',
        refresh
      )
    }
  }, [])

  const paid = hasVerifiedTestPayment(state.data)

  if (state.error) {
    return (
      <section className="section container">
        <p role="alert">{state.error}</p>
      </section>
    )
  }

  if (!state.data) {
    return (
      <section className="section container">
        Loading recorded classes...
      </section>
    )
  }

  return (
    <section className="section container student-dashboard">
      <span className="eyebrow">
        {student.internshipDomain}
      </span>

      <h1>Recorded Classes</h1>

      <Link className="back-link" to="/student">
        ← Back to Dashboard
      </Link>

      {!paid && state.data.paymentVerified ? <p>{state.data.internshipStatusNote}</p> : !paid ? (
        <>
          <p>
            Payment Pending. Complete your internship
            TEST payment to access recorded classes.
          </p>

          <Link
            className="button button-dark"
            to={paymentUrl(
              student.internshipDomain,
              'recorded'
            )}
          >
            Make Payment
          </Link>
        </>
      ) : track?.recordedClassesEnabled &&
        state.data.recordedClassesAvailable ? (
        <RecordedClasses
          domain={student.internshipDomain}
          onClose={() => navigate('/student')}
        />
      ) : (
        <p>
          Recorded classes are currently unavailable
          for your domain.
        </p>
      )}
    </section>
  )
}
