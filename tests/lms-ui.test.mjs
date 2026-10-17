import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createServer } from 'vite'

test('all eight internship cards/details show editable prices, payment states and the four learning steps', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { SiteContext, initialSite } = await vite.ssrLoadModule('/src/site-context.js')
    const { StudentSessionContext } = await vite.ssrLoadModule('/src/student-session-context.js')
    const { Internships } = await vite.ssrLoadModule('/src/App.jsx')
    const { InternshipDetail, InternshipFee, PaymentSection } = await vite.ssrLoadModule('/src/InternshipCourse.jsx')
    const { LearningStages } = await vite.ssrLoadModule('/src/StudentLearning.jsx')
    const render = (child, route = '/', site = initialSite) => renderToString(h(MemoryRouter, { initialEntries: [route] }, h(SiteContext.Provider, { value: site }, h(StudentSessionContext.Provider, { value: { student: null, loading: false } }, child)))).replaceAll('<!-- -->', '')
    const cards = render(h(Internships))
    const expected = ['Frontend Developer', 'UI/UX Designer', 'Python Developer', 'Content Creation', 'Cyber Security', 'Full Stack Development', 'Data Analyst', 'AI & Machine Learning']
    const { internshipDisplayName } = await vite.ssrLoadModule('/src/approved-internships.js')
    assert.deepEqual(initialSite.domains.map(domain => internshipDisplayName(domain.name)), expected)
    assert.equal((cards.match(/₹499/g) || []).length, 8)
    assert.equal((cards.match(/Course details/g) || []).length, 8)
    assert.ok(!cards.includes('Premium AI Tools'))
    assert.ok(!cards.includes('Save ₹300'))
    assert.ok(!cards.includes('₹799'))
    let previous = -1
    for (const name of expected) {
      const position = cards.indexOf(name.replaceAll('&', '&amp;'))
      assert.ok(position > previous, name)
      previous = position
    }
    // Retain the fee component's discount coverage without restoring the retired track.
    const premiumFee = render(h(InternshipFee, { price: 499, premium: true }))
    assert.ok(premiumFee.includes('<del>₹799</del>'))
    assert.ok(premiumFee.includes('Save ₹300'))
    for (const domain of initialSite.domains) {
      const detail = render(h(Routes, null, h(Route, { path: '/internships/:domain', element: h(InternshipDetail) })), `/internships/${encodeURIComponent(domain.name)}`)
      assert.ok(detail.includes('₹499'), domain.name)
      assert.ok(detail.includes('Razorpay is OFF'))
      assert.ok(detail.includes('Videos → Tasks → Projects → Certificate'))
      assert.ok(detail.includes(internshipDisplayName(domain.name).replaceAll('&', '&amp;')))
      if (domain.name === 'Data Analytics') assert.ok(!detail.includes('<h1>Data Analytics</h1>'))
    }
    const edited = { ...initialSite, domains: initialSite.domains.map((item, index) => ({ ...item, price: index === 0 ? 799 : 499 })) }
    const editedCards = render(h(Internships), '/', edited)
    assert.equal((editedCards.match(/₹499/g) || []).length, 7)
    assert.equal((editedCards.match(/₹799/g) || []).length, 1, 'One independently edited domain price')
    for (const status of ['Not Paid', 'Pending', 'Paid']) {
      const payment = render(h(PaymentSection, { payment: { fee: 499, status, gatewayEnabled: false } }))
      assert.ok(payment.includes(`Payment status: <strong>${status}</strong>`))
      assert.ok(!payment.includes('checkout.razorpay'))
      assert.ok(payment.includes('LIVE Razorpay is OFF'))
      assert.ok(payment.includes('Backend-verified TEST payment unlocks learning.'))
      assert.ok(payment.includes('Sign in to continue'))
    }
    const tracker = render(h(LearningStages, { stages: { steps: ['Videos', 'Tasks', 'Projects', 'Certificate'].map((name, i) => ({ name, status: i === 0 ? 'Completed' : i === 1 ? 'In Progress' : 'Locked', total: 2, completed: i === 0 ? 2 : 0, message: 'Actual recorded progress', href: `/student/${name.toLowerCase()}` })) } }))
    for (const status of ['Locked', 'In Progress', 'Completed']) assert.ok(tracker.includes(status))
    assert.ok(tracker.includes('2/2 required videos'))
    assert.ok(!tracker.includes('href="/student/projects"'), 'Locked stages have no action link')
  } finally { await vite.close() }
})
