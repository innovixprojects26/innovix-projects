import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createServer } from 'vite'

test('central navigation, public switches, availability labels and student resource visibility', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    const { SiteContext, initialSite } = await vite.ssrLoadModule('/src/site-context.js')
    const { PublicContent } = await vite.ssrLoadModule('/src/SiteConfiguration.jsx')
    const { ProjectCard, Footer } = await vite.ssrLoadModule('/src/components.jsx')
    const { InternshipForm } = await vite.ssrLoadModule('/src/InternshipForm.jsx')
    const { ContactForm } = await vite.ssrLoadModule('/src/ContactForm.jsx')
    const { ContentCreationCard } = await vite.ssrLoadModule('/src/ContentCreation.jsx')
    const { TodayTechUpdate } = await vite.ssrLoadModule('/src/TechNews.jsx')
    const { AdminApp } = await vite.ssrLoadModule('/src/Admin.jsx')
    const { Switch } = await vite.ssrLoadModule('/src/ManagementAdmin.jsx')
    const { StudentSessionContext } = await vite.ssrLoadModule('/src/student-session-context.js')
    const { StudentDashboard } = await vite.ssrLoadModule('/src/StudentDashboard.jsx')
    const render = (child, overrides = {}, path = '/') => renderToString(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SiteContext.Provider, { value: { ...initialSite, ...overrides, settings: { ...initialSite.settings, ...overrides.settings } } }, child)))
    const content = createElement(PublicContent, null, 'Managed page content')
    for (const path of ['/projects', '/projects/example', '/project-finder', '/compare']) {
      const output = render(content, { settings: { projectsEnabled: false } }, path)
      assert.ok(output.includes('Projects are currently unavailable'))
      assert.ok(!output.includes('Managed page content'))
    }
    for (const [key, path] of [['techNewsEnabled', '/tech-news'], ['customRequestsEnabled', '/build-your-project'], ['projectEnquiriesEnabled', '/projects/example/enquire']]) assert.ok(!render(content, { settings: { [key]: false } }, path).includes('Managed page content'))
    assert.ok(render(content, {}, '/projects').includes('Managed page content'))
    assert.ok(render(content, { error: 'Offline' }, '/login').includes('Managed page content'), 'Config failure must not block authentication')
    assert.ok(render(content, { announcements: [{ _id: 'a', title: 'Important update', message: '<script>unsafe</script>', type: 'Important' }] }).includes('&lt;script&gt;unsafe&lt;/script&gt;'))
    assert.ok(!render(createElement(ContactForm), { settings: { contactEnabled: false } }).includes('<form'))
    assert.ok(!render(createElement(InternshipForm), { settings: { internshipApplicationsEnabled: false } }).includes('<form'))
    const application = render(createElement(InternshipForm), { domains: [{ name: 'Open domain', active: true, applicationsOpen: true }, { name: 'Closed domain', active: true, applicationsOpen: false }] })
    assert.ok(application.includes('Open domain'))
    assert.ok(!application.includes('Closed domain'))
    assert.equal(render(createElement(TodayTechUpdate), { settings: { techNewsEnabled: false } }), '')
    assert.ok(!render(createElement(Footer), { settings: { techNewsEnabled: false } }).includes('href="/tech-news"'))
    const unavailable = render(createElement(ProjectCard, { project: { title: 'Project', slug: 'project', available: false, domain: 'Software', level: 'Beginner', demoUrl: 'https://example.test/demo' } }))
    assert.ok(unavailable.includes('Currently Unavailable'))
    assert.ok(!unavailable.includes('href="https://example.test/demo"'))
    const contentCard = render(createElement(ContentCreationCard, { index: 0, meetingUrl: 'https://example.test/live', recordedEnabled: false, applicationsOpen: false }))
    assert.ok(contentCard.includes('Join Live Class'))
    assert.ok(!contentCard.includes('Recorded Classes'))
    assert.ok(!contentCard.includes('>https://example.test/live<'))
    assert.ok(contentCard.includes('Applications are currently closed'))
    const student = { studentId: 'TEST', fullName: 'Learner', internshipDomain: 'Content Creation' }
    const dashboard = render(createElement(StudentSessionContext.Provider, { value: { student } }, createElement(StudentDashboard)), { settings: { techNewsEnabled: false } })
    assert.ok(!dashboard.includes('Daily Tech News'))
    const toggle = render(createElement(Switch, { title: 'Projects', checked: true, onChange: () => {} }))
    assert.ok(toggle.includes('role="switch"'))
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'test-admin-token' } })
    const admin = render(createElement(Routes, null, createElement(Route, { path: '/admin/*', element: createElement(AdminApp) })), {}, '/admin')
    for (const text of ['Website Management', 'Student Management', 'Customer Management', 'Content Management', 'Website Settings', 'Admin Settings', 'Live Classes', 'Recorded Classes', 'Daily Tech News', 'Students', 'Internship Applications', 'Available Projects', 'Unavailable Projects', 'Total Students']) assert.ok(admin.includes(text), text)
    for (const path of ['/admin/projects', '/admin/students', '/admin/live-classes', '/admin/announcements', '/admin/homepage', '/admin/services']) assert.ok(admin.includes(`href="${path}"`), path)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
    assert.ok(!render(createElement(Routes, null, createElement(Route, { path: '/admin/*', element: createElement(AdminApp) })), {}, '/admin').includes('Central management'))
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage)
    else delete globalThis.localStorage
    await vite.close()
  }
})
