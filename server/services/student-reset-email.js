import { env } from '../config/env.js'

export function resetEmailConfigured() { return Boolean(process.env.STUDENT_RESET_EMAIL_API_KEY && process.env.STUDENT_RESET_EMAIL_FROM) }
export async function sendStudentResetEmail(email, token) {
  const link = new URL('/reset-password', env.clientUrl)
  link.hash = `token=${token}`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.STUDENT_RESET_EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.STUDENT_RESET_EMAIL_FROM, to: [email], subject: 'Reset your Innovix Projects student password', text: `A password reset was requested for your Innovix Projects student account.\n\nOpen this link within 30 minutes:\n${link.href}\n\nIf you did not request this, ignore this email. Your password has not changed.` }),
  })
  if (!response.ok) throw new Error('Reset email delivery failed')
}
