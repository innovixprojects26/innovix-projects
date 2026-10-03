import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

test('Navbar puts About first and News before Contact and reuses news/discovery for students and guests', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { SiteContext, initialSite } = await vite.ssrLoadModule('/src/site-context.js')
    const { StudentSessionContext } = await vite.ssrLoadModule('/src/student-session-context.js')
    const { Navbar } = await vite.ssrLoadModule('/src/components.jsx')
    const { NewsHub } = await vite.ssrLoadModule('/src/NewsHub.jsx')
    const { LearnDiscover } = await vite.ssrLoadModule('/src/LearnDiscover.jsx')
    const { PublicContent } = await vite.ssrLoadModule('/src/SiteConfiguration.jsx')
    const { HomeInternship, InternshipDomains } = await vite.ssrLoadModule('/src/PublicSections.jsx')
    const { TodayTechUpdate } = await vite.ssrLoadModule('/src/TechNews.jsx')
    const student = { studentId: 'INX-TEST', fullName: 'Learner', internshipDomain: 'Content Creation' }
    const render = (component, { settings = {}, currentStudent = student, path = '/news', error = '' } = {}) => renderToString(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SiteContext.Provider, { value: { ...initialSite, error, settings: { ...initialSite.settings, ...settings } } }, createElement(StudentSessionContext.Provider, { value: { student: currentStudent, loading: false } }, component))))
    const navbar = render(createElement(Navbar))
    assert.match(navbar, /<option value="light">Light<\/option><option value="dark">Dark<\/option><option value="system" selected="">System<\/option>/)
    const navigation = navbar.match(/<nav id="primary-navigation"[\s\S]*?<div class="mobile-auth">/)[0]
    assert.deepEqual([...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/about', '/internships', '/domains', '/projects', '/news', '/contact'])
    assert.equal((navbar.match(/href="\/news"/g) || []).length, 1)
    assert.match(navigation, /aria-current="page"[^>]*class="header-news active"[^>]*href="\/news"/)
    assert.equal((navbar.match(/aria-label="Color theme"/g) || []).length, 1)
    const hidden = render(createElement(Navbar), { settings: { newsEnabled: false } })
    assert.ok(!hidden.includes('href="/news"'))
    assert.ok(hidden.includes('aria-label="Color theme"'))
    const hub = render(createElement(NewsHub))
    for (const label of ['Daily Tech News', 'Learn &amp; Discover', 'Today’s Facts', 'Interesting Facts', 'Technology Updates', 'Domain-specific Learning', 'Content Creation']) assert.ok(hub.includes(label), label)
    assert.ok(hub.includes('href="/tech-news"'))
    assert.equal((hub.match(/aria-haspopup="dialog"/g) || []).length, 5)
    const guest = render(createElement(NewsHub), { currentStudent: null })
    assert.ok(guest.includes('href="/login"'))
    assert.ok(guest.includes('href="/tech-news"'))
    assert.ok(!guest.includes('aria-haspopup="dialog"'))
    assert.equal(render(createElement(NewsHub), { settings: { newsEnabled: false } }), '')
    assert.equal(render(createElement(LearnDiscover), { settings: { newsEnabled: false } }), '')
    assert.equal(render(createElement(TodayTechUpdate), { settings: { newsEnabled: false } }), '')
    assert.ok(!render(createElement(NewsHub), { settings: { discoverEnabled: false } }).includes('aria-haspopup="dialog"'))
    assert.ok(!render(createElement(NewsHub), { settings: { techNewsEnabled: false } }).includes('href="/tech-news"'))
    const content = createElement(PublicContent, null, 'Visible content')
    for (const path of ['/news', '/tech-news', '/tech-news/article']) assert.ok(!render(content, { path, settings: { newsEnabled: false } }).includes('Visible content'))
    assert.ok(!render(content, { path: '/internships', settings: { internshipsEnabled: false } }).includes('Visible content'))
    assert.ok(render(content, { path: '/student', settings: { internshipsEnabled: false } }).includes('Visible content'))
    assert.ok(render(content, { error: 'Server offline' }).includes('Website settings could not be loaded.'))
    for (const Component of [HomeInternship, InternshipDomains]) assert.equal(render(createElement(Component), { settings: { internshipsEnabled: false } }), '')
  } finally { await vite.close() }
})
