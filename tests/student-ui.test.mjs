import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

test('student form rendering, desktop/mobile account controls, guard and safe return paths', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { StudentSessionContext } = await vite.ssrLoadModule('/src/student-session-context.js')
    const { StudentLogin, StudentRegistration, StudentForgotPassword, StudentResetPassword, StudentPasswordStrength } = await vite.ssrLoadModule('/src/StudentAuth.jsx')
    const { Navbar } = await vite.ssrLoadModule('/src/components.jsx')
    const { RequireStudent } = await vite.ssrLoadModule('/src/StudentSession.jsx')
    const { safeStudentReturnTo } = await vite.ssrLoadModule('/src/student-api.js')
    const render = (Component, student = null, props = {}, location = '/') => renderToString(createElement(MemoryRouter, { initialEntries: [location] }, createElement(StudentSessionContext.Provider, { value: { student, loading: false, error: '', login: async () => {}, logout: async () => {}, refresh: async () => {} } }, createElement(Component, props))))
    const navbar = render(Navbar)
    for (const mode of ['desktop-auth', 'mobile-auth']) assert.match(navbar, new RegExp(`class="${mode}"><a[^>]*href="/login"`))
    assert.equal((navbar.match(/href="\/login"/g) || []).length, 2)
    const profile = render(Navbar, { fullName: 'Test Learner' })
    assert.equal((profile.match(/href="\/student"/g) || []).length, 2)
    assert.equal((profile.match(/href="\/student\/internship"/g) || []).length, 2)
    assert.equal((profile.match(/>Logout<\/button>/g) || []).length, 2)
    assert.ok(!profile.includes('href="/login"'))
    const login = render(StudentLogin)
    for (const text of ['Welcome Back', 'Student Login', 'Remember Me', 'Forgot Password?', 'Create Account', 'name="email"', 'name="password"', 'Show password', '<form']) assert.ok(login.includes(text), text)
    assert.match(login, /href="\/register"/)
    const registration = render(StudentRegistration)
    for (const name of ['fullName', 'email', 'phone', 'phoneCountry', 'college', 'course', 'yearOfStudy', 'internshipDomain', 'password', 'confirmPassword']) assert.ok(registration.includes(`name="${name}"`), name)
    for (const domain of ['Content Creation', 'Data Analytics', 'Full Stack Development']) assert.ok(registration.includes(domain))
    const resetForm = render(StudentResetPassword, null, {}, `/reset-password#token=${'a'.repeat(64)}`)
    for (const form of [registration, resetForm]) {
      assert.equal((form.match(/minLength="8"/g) || []).length, 2)
      for (const input of form.match(/<input[^>]+type="password"[^>]*>/g) || []) assert.match(input, /maxLength="72"/)
      assert.ok(form.includes('Use 8–72 characters with uppercase and lowercase letters'))
      assert.ok(form.includes('Password strength:'))
      assert.equal((form.match(/data-met="false"/g) || []).length, 6)
      assert.match(form, /<button class="button button-dark" disabled=""/)
      assert.ok(!form.includes('at least 10 characters'))
    }
    for (const [password, strength, met] of [['', 'Weak', 0], ['12345678', 'Weak', 2], ['Password123!', 'Weak', 5], ['LearnCode9', 'Medium', 5], ['Learn@Code9', 'Strong', 6]]) {
      const feedback = render(StudentPasswordStrength, null, { password })
      assert.ok(feedback.includes(`<strong>${strength}</strong>`))
      assert.equal((feedback.match(/data-met="true"/g) || []).length, met)
      for (const label of ['Be 8–72 characters', 'Include an uppercase letter', 'Include a lowercase letter', 'Include a number', 'Include a special character', 'Not be a common or easily guessed password']) assert.ok(feedback.includes(label))
    }
    assert.ok(!login.includes('Password strength:'))
    assert.ok(render(StudentForgotPassword).includes('Request reset link'))
    assert.ok(render(StudentResetPassword).includes('Open the complete reset link'))
    const secret = createElement('div', null, 'Protected student content')
    assert.ok(!render(RequireStudent, null, { children: secret }, '/student').includes('Protected student content'))
    assert.ok(render(RequireStudent, { fullName: 'Test Learner' }, { children: secret }, '/student').includes('Protected student content'))
    assert.equal(safeStudentReturnTo('/student/recorded-classes'), '/student/recorded-classes')
    for (const unsafe of ['https://attacker.invalid', '//attacker.invalid', '/admin', '/student/../admin', '/student/unknown']) assert.equal(safeStudentReturnTo(unsafe), '/student')
  } finally { await vite.close() }
})
