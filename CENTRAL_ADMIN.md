# Central Admin management

Enter through `/admin` and use the existing administrator login. All modules remain inside that protected application; no separate project, news, video or student login was introduced. Light/Dark/System controls remain available.

## Daily use

- **Projects:** create, edit, save drafts, publish/unpublish, preview saved content, delete with confirmation, change prices, and switch availability, featured, trending and popular states. The editor also controls whether an unavailable project stays visible.
- **Internships:** enable/disable existing domains, applications, live classes and recorded classes. Turning a domain inactive removes it from public internship listings and disables its learning resources. Existing student accounts are retained.
- **Live Classes:** choose a domain and save its class title, meeting URL, date, start time, description and active state. Public/student buttons say “Join Live Class”; raw meeting URLs are not shown as page text. Times display as entered; use the description to clarify the class time zone when needed.
- **Recorded Classes:** the existing Content Creation upload, preview, publishing, reordering and deletion workflow remains in the same dashboard. Binary files remain in the existing separate storage directory, not MongoDB. Metadata now includes a domain field for future expansion. Other domains' recorded-class switches are configuration only until their libraries are integrated.
- **Daily Tech News:** existing create/edit/preview/publish/feature/delete controls remain. Website Settings contains the global news switch.
- **Students:** search by name, email, ID or college; filter by domain/status; view the complete non-secret profile; activate or suspend with confirmation.
- **Applications, Enquiries, Custom Requests:** search and filter, read complete records, and update statuses. Existing database status values are preserved, including Reviewed, Completed and Accepted where supported.
- **Contact Messages:** search, filter Read/Unread, read full messages, change read state and delete with confirmation. The overview includes the unread count.
- **Testimonials:** create, edit, preview, publish/unpublish and delete with confirmation. Only published entries appear publicly.
- **Homepage Content:** edit hero heading/highlight/subtitle, primary CTA text, about summary and important notice. The summary is also used on the About page.
- **Services:** add/edit descriptions, hide/show or remove service entries. Saved entries appear on Home and About. The current UI preserves entry order and appends new entries.
- **Announcements:** create/edit/preview banner text, set Information/Success/Warning/Important, schedule start/end dates in UTC, and activate/deactivate/delete. Active banners within their schedule appear on public/student content pages.
- **Website Settings:** control project listings, project enquiries, custom requests, internship applications, news, testimonials and the contact form; edit support email/phone, WhatsApp and Instagram/YouTube/LinkedIn links.
- **Admin Settings:** view the current account and recent action history. Credential changes continue to use the existing server administrator tools. Secrets are deliberately not website settings.

## Availability behavior

Project `available=false` never deletes a project. If `visibleWhenUnavailable` is true (the default), the published project remains visible with “Currently Unavailable”; purchase/enquiry/demo actions are replaced or disabled. If visibility is false, it is omitted from public listings and its public detail route. Admin can still edit and preview it. Publishing remains independent of availability.

Turning off the global project section hides project results and replaces project/detail/finder/compare pages with the unavailable message. Turning it on restores saved published projects. Enquiry and application controls are enforced by the backend as well as the interface: direct POST requests cannot bypass closed settings. Turning off news hides its dashboard/home panels and navigation link and blocks article retrieval. No section switch deletes content.

Settings are read from MongoDB without a server cache. Open public pages refresh configuration every 30 seconds, on navigation and on window focus. Project and news reads also refresh when configuration refreshes. A fresh API request sees a saved change immediately; no build, commit or deployment is needed for ordinary admin edits. API enforcement applies even if an already-open browser has stale content.

Suspension uses the existing `accountStatus` and `authVersion` fields. It revokes student sessions and reset tokens; existing login/session middleware rejects suspended accounts. Reactivation permits a fresh login but does not revive old sessions. Password hashes, session tokens and reset tokens are never included in the Students API or activity history. Password policy, bcrypt, cookies, CSRF, Remember Me and admin login behavior are preserved.

## Models and migration

Added collections:

| Model / collection | Purpose |
| --- | --- |
| WebsiteConfig / websiteconfigs | Singleton settings, homepage content and services |
| InternshipDomain / internshipdomains | Existing internship availability and live-class configuration |
| Announcement / announcements | Scheduled banners |
| AdminActivity / adminactivities | Successful admin action, resource target and timestamp; no request bodies or credentials |

Extended existing models:

- Project: `available` defaults true, `visibleWhenUnavailable` defaults true, `featured` defaults false. Missing fields on older records are treated safely without rewriting them.
- ContentVideo: `domain` defaults to Content Creation. Legacy metadata without that field continues to work; binaries and paths are unchanged.
- Student schema is unchanged; management reuses existing status/version fields and StudentSession records.

An additive, idempotent initializer copies existing internship domains and meeting links into MongoDB at API startup (also ensured when configuration/domain management is first read). It inserts missing domains only; it never overwrites saved admin values. Website settings/content use existing-content defaults until saved. No manual migration or deletion of existing project/student/news/video content was performed. Final integration tests used isolated temporary databases and removed them afterward. The news test was updated to use an isolated database too.

## API additions

All admin routes below require the existing administrator bearer token:

| Method | Route |
| --- | --- |
| GET | `/api/configuration` (public, non-secret configuration and currently visible banners/domains) |
| GET | `/api/admin/configuration` |
| PUT | `/api/admin/configuration/:section` (`settings`, `homepage`, `services`) |
| GET | `/api/admin/internship-domains` |
| PATCH | `/api/admin/internship-domains/:id` |
| GET | `/api/admin/students` (optional `search`, `domain`, `status`) |
| PATCH | `/api/admin/students/:id/account-status` |
| GET, POST | `/api/admin/announcements` |
| PUT, DELETE | `/api/admin/announcements/:id` |
| GET | `/api/admin/profile` |
| GET | `/api/admin/activity` (latest 100 entries) |

Existing project APIs accept the new flags. Existing overview API includes available/unavailable projects, students, published news, recorded videos and recent student registrations. Existing public APIs enforce section controls. Student dashboard uses saved live-class configuration; video listing and media streaming enforce the Content Creation resource switches while preserving admin preview access.

## Verification and limits

- Passed: 5 API/authentication tests across management, student authentication, video and news suites.
- Passed: 6 UI/theme tests including central admin navigation, public OFF states, unavailable projects, class buttons, safe announcement rendering, student form rendering, theme modes and persistence.
- Passed: lint, production build and whitespace check.
- Build retains the existing large JavaScript chunk warning. SSR tests may report the occupied Vite HMR port; tests still pass.
- No browser was connected. Actual click-through, mobile rendering, keyboard/focus flows and visual layout remain unverified. UI tests render components on the server; they are not browser interaction tests.
- No dependencies were added. Nothing was deployed or pushed.

Source changes are still needed for new layouts/CSS, static FAQ and other non-managed marketing copy, pricing-package definitions, additional student-authentication domain values, additional domain video libraries and administrator credential tooling. This is a content management system, not a visual page builder. The Students screen currently loads the matching student list without pagination; pagination would be appropriate for a substantially larger installation.

## Exact source files changed for this request

Previously existing changes from the password-policy and theme tasks are not counted here unless this request also edited the file.

```text
CENTRAL_ADMIN.md
server/controllers/admin.js
server/controllers/content-videos.js
server/controllers/management.js
server/controllers/public.js
server/controllers/tech-news.js
server/management.test.js
server/models/content-video.js
server/models/index.js
server/models/management.js
server/routes/admin.js
server/routes/content-videos.js
server/routes/public.js
server/routes/student.js
server/server.js
server/tech-news.test.js
src/Admin.jsx
src/App.jsx
src/ContactForm.jsx
src/ContentCreation.jsx
src/InternshipForm.jsx
src/ManagementAdmin.jsx
src/PublicSections.jsx
src/SiteConfiguration.jsx
src/StudentDashboard.jsx
src/TechNews.jsx
src/components.jsx
src/management.css
src/site-context.js
tests/management-ui.test.mjs
```
