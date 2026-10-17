import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { sameInternshipDomain } from '../shared/internship-domain.js'

test('all eight domains: payment gates live links, verified access requires an available URL', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { StudentLiveClass } = await vite.ssrLoadModule('/src/StudentDashboard.jsx')
    for (const domain of ['Frontend Developer', 'UI/UX Designer', 'Python Developer', 'Content Creation', 'Cyber Security', 'Full Stack Development', 'Data Analyst', 'AI & Machine Learning']) {
      assert.ok(sameInternshipDomain(domain, domain === 'Data Analyst' ? 'Data Analytics' : domain))
      const render = (liveClass, liveClassUrl, paymentVerified = false, domainAccess = paymentVerified, liveClassAvailable = true) => renderToString(createElement(MemoryRouter, null, createElement(StudentLiveClass, { domain, liveClass, liveClassUrl, paymentVerified, domainAccess, liveClassAvailable })))
      const pending = render({}, null)
      assert.ok(pending.includes("Payment Pending"))
      assert.ok(pending.includes("Join Live Class — Make Payment"))
      const disabled = render({}, null, true)
      assert.match(disabled, /<button[^>]*disabled=""[^>]*>Join Live Class<\/button>/)
      assert.ok(disabled.includes("Payment verified. Live class link"))
      const unavailable = render({}, null, true, false)
      assert.ok(unavailable.includes('internship access is unavailable'))
      assert.ok(!unavailable.includes('Join Live Class — Make Payment'))
      const disabledDomain = render({}, null, true, true, false)
      assert.ok(disabledDomain.includes('Live classes are currently unavailable'))
      const url = `https://example.test/live/${encodeURIComponent(domain)}`
      const joined = render({}, url, true)
      assert.ok(joined.includes(`href="${url}"`))
      assert.ok(!joined.includes('disabled='))
      assert.ok(render(null, null).includes('Payment Pending'))
    }
  } finally { await vite.close() }
})
