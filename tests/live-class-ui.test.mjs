import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import { sameInternshipDomain } from '../shared/internship-domain.js'

test('all eight domains: ON with URL joins, ON without URL is disabled, OFF is hidden', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { StudentLiveClass } = await vite.ssrLoadModule('/src/StudentDashboard.jsx')
    for (const domain of ['Frontend Developer', 'UI/UX Designer', 'Python Developer', 'Content Creation', 'Cyber Security', 'Full Stack Development', 'Data Analyst', 'AI & Machine Learning']) {
      assert.ok(sameInternshipDomain(domain, domain === 'Data Analyst' ? 'Data Analytics' : domain))
      const render = (liveClass, liveClassUrl) => renderToString(createElement(StudentLiveClass, { domain, liveClass, liveClassUrl }))
      const pending = render({}, null)
      assert.match(pending, /<button[^>]*disabled=""[^>]*>Join Live Class<\/button>/)
      assert.ok(pending.includes('Live class link will be updated soon.'))
      const url = `https://example.test/live/${encodeURIComponent(domain)}`
      const joined = render({}, url)
      assert.ok(joined.includes(`href="${url}"`))
      assert.ok(!joined.includes('disabled='))
      assert.equal(render(null, null), '')
    }
  } finally { await vite.close() }
})
