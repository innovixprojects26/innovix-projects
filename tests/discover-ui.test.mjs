import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

test('Discover launcher, internal cards, safe source links, admin controls and responsive/theme rules', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { SiteContext, initialSite } = await vite.ssrLoadModule('/src/site-context.js')
    const { StudentSessionContext } = await vite.ssrLoadModule('/src/student-session-context.js')
    const { LearnDiscover, DiscoverCard, DiscoverDetail } = await vite.ssrLoadModule('/src/LearnDiscover.jsx')
    const { DiscoverAdmin } = await vite.ssrLoadModule('/src/DiscoverAdmin.jsx')
    const { discoverTypes, discoverTypeLabels, discoverTabs } = await vite.ssrLoadModule('/shared/discover.js')
    const render = (element, { student = { studentId: 'INX-TEST', internshipDomain: 'Content Creation' }, enabled = true } = {}) => renderToString(createElement(MemoryRouter, null, createElement(SiteContext.Provider, { value: { ...initialSite, settings: { ...initialSite.settings, discoverEnabled: enabled } } }, createElement(StudentSessionContext.Provider, { value: { student, csrfToken: 'test' } }, element))))
    const button = render(createElement(LearnDiscover))
    assert.ok(button.includes('Learn &amp; Discover'))
    assert.ok(button.includes('aria-haspopup="dialog"'))
    assert.ok(button.includes('aria-expanded="false"'))
    assert.ok(!button.includes('href='), 'Opening discovery must not navigate')
    assert.equal(render(createElement(LearnDiscover), { student: null }), '')
    assert.equal(render(createElement(LearnDiscover), { enabled: false }), '')
    const item = { _id: 'test', title: '<script>example</script>', type: 'NEWS', summary: 'Short summary', whyItMatters: 'Context', whatYouCanLearn: 'Practice', takeaway: 'Review', domains: ['Content Creation'], category: 'Creators', sourceName: 'Publisher', sourceUrl: 'https://example.com/article', publishedAt: '2026-09-26T12:00:00Z', retrievedAt: '2026-09-27T12:00:00Z', readTime: 2, isNew: true }
    for (const type of discoverTypes) {
      const card = render(createElement(DiscoverCard, { item: { ...item, type }, onOpen: () => {} }))
      assert.ok(card.includes('discover-type'))
      assert.ok(discoverTypeLabels[type])
      assert.ok(card.includes('NEW'))
      assert.ok(!card.includes('<script>'))
      assert.ok(!card.includes('href='), 'Cards open internal details')
    }
    const read = render(createElement(DiscoverCard, { item: { ...item, read: true, isNew: false }, onOpen: () => {} }))
    assert.ok(!read.includes('>NEW<'))
    assert.ok(read.includes('>Read<'))
    const detail = render(createElement(DiscoverDetail, { item, onBack: () => {} }))
    for (const text of ['Why this matters', 'What you can learn', 'Key takeaway', 'Source:', 'Published', 'Read Original Source', 'Back to discoveries']) assert.ok(detail.includes(text))
    assert.ok(detail.includes('target="_blank" rel="noopener noreferrer"'))
    assert.equal((detail.match(/href=/g) || []).length, 1)
    assert.ok(!detail.includes('<iframe'))
    const admin = render(createElement(DiscoverAdmin))
    for (const text of ['Content', 'Trusted Sources', 'Categories', 'Domain Mapping', 'Create Manual Item', '/admin/website-settings']) assert.ok(admin.includes(text), text)
    assert.deepEqual(Object.keys(discoverTabs), ['For You', 'News', 'Facts', 'Learn', 'Career'])
    const css = await readFile(new URL('../src/discover.css', import.meta.url), 'utf8')
    assert.match(css, /width:min\(520px,100vw\)/)
    assert.match(css, /@media\(max-width:600px\)/)
    assert.match(css, /prefers-reduced-motion:reduce/)
    for (const variable of ['--surface', '--text', '--primary', '--page']) assert.ok(css.includes(`var(${variable})`))
  } finally { await vite.close() }
})
