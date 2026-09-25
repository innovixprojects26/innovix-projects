# Student authentication

## What was broken

The desktop and mobile navigation already linked to `/login`, but the shared `Auth` page was a static placeholder. Its button had no form submission handler, student API, account model, session, or dashboard. It has been replaced with real student pages; the admin JWT flow is unchanged.

## Try the complete flow

1. Configure the existing backend environment and start `npm run dev:full`.
2. Open the frontend at the exact `CLIENT_URL` (normally `http://localhost:5173`). Select **Log in → Create Account**.
3. Enter all registration fields. Select one of the existing internship domains, including Content Creation or Data Analytics. Passwords require at least 10 characters, uppercase, lowercase and a digit, and at most 72 UTF-8 bytes.
4. Registration returns to Login. Log in with the account you just created. **Remember Me** creates a 30-day persistent cookie; without it the cookie lasts for the browser session, with a 12-hour server expiration.
5. `/student` displays your account and domain-specific links. Open the account menu to find Dashboard, My Internship and Logout. Refresh restores the session from the backend.
6. Logout deletes the server session and expires its cookie. Reusing that cookie cannot access protected APIs. Browser tabs are notified to refresh account state.

Creating a student account does not create or approve an internship application. Existing application records are not automatically linked by an unverified email address. The dashboard labels the account as registered and links to the existing application flow. No fabricated enrollment decision or progress percentage is shown; progress tracking is not implemented yet.

## Pages and APIs

Public pages: `/login`, `/register`, `/forgot-password`, `/reset-password`.

Protected pages: `/student`, `/student/internship`, `/student/recorded-classes`. Anonymous visitors are redirected to Login and returned to a validated student route after login. Recorded Content Creation classes require a Content Creation account; other domains display an unavailable message and cannot fetch that domain's video APIs.

| Method | API | Purpose |
| --- | --- | --- |
| POST | `/api/student/register` | Validate fields and create a student; does not log in automatically |
| POST | `/api/student/login` | Verify credentials and set the session cookie |
| GET | `/api/student/me` | Restore the authenticated student and session-bound CSRF token |
| GET | `/api/student/dashboard` | Return the authenticated student's domain resources |
| POST | `/api/student/logout` | Revoke session; requires the CSRF header |
| POST | `/api/student/forgot-password` | Request a reset email, or report missing email configuration |
| POST | `/api/student/reset-password` | Consume a one-use reset token and revoke existing sessions |

Existing `/api/content-creation/videos` list and `/api/content-creation/videos/:id/media/:kind` endpoints now require an active Content Creation student session. The existing scoped admin preview token remains valid for previews. Existing Zoom URLs and Daily Tech News endpoints are unchanged.

## Storage and security

- Mongoose `Student` → MongoDB `students`: unique generated `studentId`, unique normalized email, required profile fields, bcrypt cost-12 password hash and active/suspended account status. `StudentSession` → `studentsessions`: hashed random 256-bit session identifier, student reference, authentication version and expiration, with TTL cleanup.
- Password hashes and reset tokens are not returned in student responses. Passwords are not stored in frontend storage or logged. Session cookies are HttpOnly, host-only, Path=/, SameSite=Lax by default, and Secure in production; Secure cookies use the `__Host-` prefix.
- Expiration and account status are enforced on each authenticated API request, independently of MongoDB TTL cleanup. Password resets increment the student's authentication version and invalidate all sessions, including sessions created concurrently with the reset from stale credentials.
- Mutations require JSON and an exact trusted Origin matching `CLIENT_URL`. Logout additionally requires `X-CSRF-Token`, obtained from Login or `/me`. The CSRF token is kept in React memory. Cookies are sent using `credentials: include`.
- Student routes have IP-based rate limits for registration, login and password-reset attempts. Input fields are explicitly selected; clients cannot set roles, account status, session versions, password hashes or student IDs.
- Student cookies cannot authenticate admin APIs; admin JWTs cannot authenticate student APIs. No changes to the existing admin token verification or password logic were made.
- Reset tokens are random, hashed at rest, expire after 30 minutes and are consumed atomically. The email puts the token in a URL fragment to avoid sending it to web-server access logs/referrers. A new reset request replaces the previous token.

## Environment and email configuration

Existing variables remain required: `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, and the existing admin configuration used by server startup. No new student signing secret is needed because sessions use opaque identifiers. Keep all secrets in backend environment variables; do not prefix them with `VITE_`.

- `CLIENT_URL`: exact frontend origin, including its scheme and port, without a trailing slash. It controls credentialed CORS, mutation Origin checks and the reset-email link. Use this host consistently during development (do not mix `localhost` and `127.0.0.1`).
- `STUDENT_COOKIE_SAME_SITE`: optional; defaults to `lax`. Use same-site frontend/API hosting or a same-origin `/api` proxy when possible. If frontend and API are on unrelated HTTPS sites, `none` enables Secure cross-site cookies, but browser third-party-cookie restrictions can still prevent login. HTTP development should keep `lax`.
- `STUDENT_RESET_EMAIL_API_KEY`: optional Resend API key, stored only on the backend.
- `STUDENT_RESET_EMAIL_FROM`: optional sender on a verified Resend domain, e.g. `Innovix Projects <students@your-domain.example>`.

The reset-email adapter uses Resend's [Send Email API](https://resend.com/docs/api-reference/emails/send-email) through native `fetch`; no package was added. You can replace this adapter with an existing transactional email provider later. Until both email variables are set, Forgot Password returns an explicit 503 stating that delivery is not configured. Provider failures also return an error rather than claiming success. No actual emails are sent by the tests.

## Validation

- `npm run lint`
- `npm run build`
- `node --test server/student-auth.test.js server/content-videos.test.js`
- `node --test tests/student-ui.test.mjs`

API tests create uniquely named temporary MongoDB databases and delete them afterward. They cover registration validation, duplicate emails, hashing, generic login errors, account suspension, cookie flags, refresh, expiration, CSRF, logout revocation, reset configuration/errors, single-use and expired reset tokens, admin separation, domain resource access and rate limiting. Video tests cover authenticated playback ranges and preserve admin preview/upload/edit/order/delete behavior.

UI tests render the actual React components and check desktop/mobile navigation, form fields, profile menus, anonymous protected-content exclusion, and safe return paths. They are not real-browser click, responsive-layout or codec-playback tests. No connected browser was available for those checks.

No real student accounts are seeded. Create a test account through `/register` with an email you control; the integration tests clean up their own temporary accounts. No deployment or GitHub push was performed.
