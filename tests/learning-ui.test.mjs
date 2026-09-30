import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

test('learning UI exposes real progress, private student routes, admin modules, public verification and feature gates', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    const { SiteContext, initialSite } = await vite.ssrLoadModule('/src/site-context.js')
    const { StudentSessionContext } = await vite.ssrLoadModule('/src/student-session-context.js')
    const { ProgressOverview, StudentTasks, StudentCertificates } = await vite.ssrLoadModule('/src/StudentLearning.jsx')
    const { CertificateVerificationCard, VerifyCertificate } = await vite.ssrLoadModule('/src/CertificatePages.jsx')
    const { NotificationCenter } = await vite.ssrLoadModule('/src/NotificationCenter.jsx')
    const { LearningForm, LearningUpload } = await vite.ssrLoadModule('/src/learning-ui.jsx')
    const { SubmissionHistory } = await vite.ssrLoadModule('/src/TaskAdmin.jsx')
    const { CountChart } = await vite.ssrLoadModule('/src/LearningAnalytics.jsx')
    const { taskTab } = await vite.ssrLoadModule('/shared/learning.js')
    const { AdminApp } = await vite.ssrLoadModule('/src/Admin.jsx')
    const { adminFetch } = await vite.ssrLoadModule('/src/api.js')
    const { safeStudentReturnTo } = await vite.ssrLoadModule('/src/student-api.js')
    const student = { studentId: 'INX-TEST', fullName: 'Learner', internshipDomain: 'Content Creation' }
    const render = (element, { settings = {}, currentStudent = student, path = '/' } = {}) => renderToString(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SiteContext.Provider, { value: { ...initialSite, settings: { ...initialSite.settings, ...settings } } }, createElement(StudentSessionContext.Provider, { value: { student: currentStudent, loading: false, csrfToken: 'test' } }, element)))).replaceAll('<!-- -->', '')
    const data = { enrollment: { status: 'Enrolled', batch: { name: 'Creative cohort', code: 'CC-01', domain: 'Content Creation', mentor: 'Mentor Name', startDate: '2026-01-01', endDate: '2026-01-11', status: 'Active' } }, internshipProgress: { percent: 50, daysCompleted: 5, daysRemaining: 5 }, tasksAssigned: 4, tasksCompleted: 1, tasksPending: 3, videosWatched: 0, discoveriesRead: 2, upcoming: [], activity: [], history: [], eligibility: { eligible: false, reasons: ['Required tasks remain.'], completedTasks: 1, requiredTasks: 4, completedVideos: 0, requiredVideos: 1 } }
    const overview = render(createElement(ProgressOverview, { data, settings: initialSite.settings }))
    for (const label of ['Creative cohort', 'CC-01', 'Mentor Name', '50%', '5 days completed', 'Tasks Assigned', 'Tasks Completed', 'Videos Watched', 'Certificate Eligibility', 'Required tasks remain.']) assert.ok(overview.includes(label), label)
    assert.match(overview, /<progress max="100" value="50"/)
    assert.ok(overview.includes('No pending deadlines.'))
    assert.ok(!overview.includes('Progress tracking is not available'))
    const disabled = render(createElement(ProgressOverview, { data, settings: { ...initialSite.settings, batchesEnabled: false, tasksEnabled: false, certificateVerificationEnabled: false } }))
    for (const label of ['Creative cohort', 'Tasks Assigned', 'Certificate Eligibility']) assert.ok(!disabled.includes(label))
    const tasks = render(createElement(StudentTasks))
    for (const label of ['Pending', 'Submitted', 'Reviewed', 'Completed']) assert.ok(tasks.includes(label))
    assert.ok(render(createElement(StudentTasks), { settings: { tasksEnabled: false } }).includes('Tasks are currently unavailable'))
    assert.ok(render(createElement(StudentCertificates), { settings: { certificateVerificationEnabled: false } }).includes('Certificates are currently unavailable'))
    assert.equal(taskTab({}), 'Pending'); assert.equal(taskTab({ submission: { status: 'Resubmit' } }), 'Pending')
    assert.equal(taskTab({ submission: { status: 'Submitted' } }), 'Submitted'); assert.equal(taskTab({ submission: { status: 'Approved' } }), 'Reviewed'); assert.equal(taskTab({ submission: { status: 'Completed' } }), 'Completed')
    const history = render(createElement(SubmissionHistory, { revisions: [{ _id: '1', submittedAt: '2026-01-01', text: '<script>unsafe</script>', reviewedAt: '2026-01-02', reviewStatus: 'Resubmit', feedback: 'Improve the ending.', marks: 50 }, { _id: '2', submittedAt: '2026-01-03', text: 'Revised work' }] }))
    for (const label of ['Revision 1', 'Revision 2', 'Changes Requested', 'Improve the ending.', 'Revised work']) assert.ok(history.includes(label))
    assert.ok(history.includes('&lt;script&gt;')); assert.ok(!history.includes('<script>'))
    const cert = { certificateId: 'INX-INT-2026-1234567890ABCDEF', studentName: 'Learner', type: 'Internship Certificate', domain: 'Content Creation', batchName: 'Creative cohort', duration: '10 days', issueDate: '2026-01-11', status: 'Active', email: 'hidden@example.test', phone: 'PRIVATE', studentId: 'PRIVATE-ID' }
    const verification = render(createElement(CertificateVerificationCard, { item: cert }), { currentStudent: null })
    assert.ok(verification.includes('VERIFIED CERTIFICATE')); assert.ok(verification.includes(`/verify/${cert.certificateId}`))
    assert.ok(!verification.includes('hidden@example.test')); assert.ok(!verification.includes('PRIVATE'))
    assert.ok(render(createElement(CertificateVerificationCard, { item: { ...cert, status: 'Revoked' } })).includes('Certificate Revoked'))
    assert.ok(render(createElement(VerifyCertificate), { currentStudent: null, settings: { certificateVerificationEnabled: false } }).includes('verification is currently unavailable'))
    assert.ok(render(createElement(NotificationCenter)).includes('aria-label="Notifications"'))
    assert.equal(render(createElement(NotificationCenter), { currentStudent: null }), '')
    assert.equal(render(createElement(NotificationCenter), { settings: { notificationsEnabled: false } }), '')
    assert.ok(render(createElement(LearningUpload, { taskId: 'test' })).includes('accept=".pdf,.png,.jpg,.jpeg,.txt"'))
    const form = render(createElement(LearningForm, { fields: [{ key: 'title', label: 'Task Title', required: true }, { key: 'methods', label: 'Submission methods', type: 'checks', options: ['text', 'file'] }], initial: { title: '', methods: ['text'] }, onSave: () => {} }))
    assert.ok(form.includes('Task Title')); assert.ok(form.includes('required=""')); assert.ok(form.includes('aria-label="file"'))
    const chart = render(createElement(CountChart, { title: 'Actual enrollment', items: [{ _id: 'Cohort', count: 3 }] }))
    assert.match(chart, /value="3"/); assert.ok(chart.includes('Cohort: 3'))
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'test-token' } })
    const admin = render(createElement(Routes, null, createElement(Route, { path: '/admin/*', element: createElement(AdminApp) })), { path: '/admin' })
    for (const path of ['/admin/batches', '/admin/tasks', '/admin/submissions', '/admin/certificates', '/admin/notifications', '/admin/gamification', '/admin/enquiries']) assert.ok(admin.includes(`href="${path}"`), path)
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/admin/learning/batches')
        assert.equal(options.method, 'POST')
        assert.equal(options.headers['Content-Type'], 'application/json', 'Admin authorization must not replace the JSON header')
        assert.equal(options.headers.Authorization, 'Bearer test-token')
        assert.equal(JSON.parse(options.body).name, 'Test Batch')
        return { ok: true, json: async () => ({ success: true, data: { _id: 'saved' } }) }
      }
      assert.equal((await adminFetch('/learning/batches', { method: 'POST', body: JSON.stringify({ name: 'Test Batch' }) }))._id, 'saved')
    } finally { globalThis.fetch = originalFetch }
    assert.equal(safeStudentReturnTo('/student/tasks'), '/student/tasks'); assert.equal(safeStudentReturnTo('/student/certificates'), '/student/certificates'); assert.equal(safeStudentReturnTo('/student/tasks/../../admin'), '/student')
    const css = await readFile(new URL('../src/learning.css', import.meta.url), 'utf8')
    for (const token of ['var(--surface)', 'var(--text)', 'max-width:600px', 'overflow-x:auto', 'prefers-reduced-motion']) assert.ok(css.includes(token))
  } finally { if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; await vite.close() }
})
