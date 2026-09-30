# Student Learning and Internship Management upgrade

## Completion and continuation

The initial part of this upgrade added the learning models, batch/task/submission controllers, enrollment history, ownership checks, file storage, certificate APIs, notifications, progress, lead and analytics services, feature defaults and server route registration. The continuation finished the existing Admin and Student dashboard integrations, forms, navigation, verification pages, bell/panel, playback tracking, achievement UI, styling, workflow tests and regression checks. It did not restart or replace the application.

All requested modules are connected. No separate application, Admin dashboard, authentication system, enquiry database or external messaging system was introduced. Mentors review work through existing authorized Admin access; this upgrade does not introduce a second mentor login.

## Admin workflow

Use the existing `/admin` login and sidebar:

1. **Internship Applications**: set an application to Selected. Its **Assign to Batch** link carries the application ID into the batch screen. Choose the matching registered student when assigning. Admin can also enroll a registered student directly.
2. **Batches** (`/admin/batches`): create a named/code-identified batch with domain, dates, duration label, mentor, description, capacity, deadline and status. Use Upcoming or Active before assigning students. View Students includes historical enrollments. Transfer is an explicit checkbox on the destination batch; both source history and destination enrollment are retained. Remove ends an enrollment without deleting it. Only unused drafts can be deleted. Completed batches cannot be edited or deleted. Completion is allowed only after the end date. Optional required recorded videos must be published Content Creation videos with known duration.
3. **Tasks & Assignments** (`/admin/tasks`): target an internship domain, a batch, or one student. Set instructions, assignment/due dates, allowed response methods, required/optional status, optional maximum marks and reference URL. Save, publish or close a task. Upload an optional attachment after the task has been saved. A task with submissions cannot change its audience.
4. **Submissions** (`/admin/submissions`): open the response/history, review text/URLs/files, add feedback and optional marks, and choose Under Review, Approved, Resubmit or Completed. Resubmit requires explanatory feedback. A version check prevents reviewing over a newer submission.
5. **Certificates** (`/admin/certificates`): choose a completed enrollment and certificate type, check eligibility, and explicitly confirm issuance. Review and revoke issued certificates from the same page. Verification links are also QR destinations.
6. **Project Enquiries / Leads** (`/admin/enquiries`): uses existing enquiry records. Change status, append internal notes, set/clear follow-up dates, review requested projects/customer details and use explicit Call/Email/WhatsApp links. Status history is retained. Overdue follow-ups are highlighted and filterable. Legacy Converted records remain supported.
7. **Notifications** (`/admin/notifications`): send an in-app message to an individual student or one internship domain. Delivery requires an explicit admin action and confirmation; it sends no external message.
8. **Gamification** (`/admin/gamification`): explains reward rules and links to the existing Website Settings controls.
9. **Dashboard**: existing cards remain. Additional learning cards and lightweight HTML meter charts use MongoDB counts and aggregates.

Capacity reservations, transfers, removals and batch completion use MongoDB transactions. The current MongoDB Atlas architecture supports them; a self-hosted MongoDB installation must use a replica set. A unique partial enrollment index permits at most one Enrolled record per student. Completed, Transferred and Removed records remain available as history. The application deadline is metadata for the administrator; administrators can explicitly assign approved students after that deadline.

## Student experience and calculations

The existing Student Dashboard includes task/certificate navigation, a batch summary, date progress, actual task totals, watched-video count, discovery-read count, recent activity, upcoming tasks, eligibility and enrollment history. The existing dashboard status reflects the assigned batch. Existing live-class and recording links remain in place.

- **My Tasks** (`/student/tasks`) has Pending, Submitted, Reviewed and Completed tabs. Changes Requested appears under Pending; Submitted/Under Review under Submitted; Approved under Reviewed; Completed under Completed.
- A student uses at least one admin-enabled submission method: text, a GitHub repository, a project/demo URL or a file. File uploads show progress. Late work is accepted while a task remains Published and is explicitly marked late. Closed tasks reject new submissions.
- Updated versions are accepted only after Changes Requested. Each version keeps its submitted text/URLs/file, timestamp, late state, feedback, marks and review information. The limit is 50 revisions per submission.
- **My Certificates** (`/student/certificates`) lists only the current student's certificates and links to verification.
- **Internship date progress** is elapsed full days divided by the batch's date span, clamped to 0–100%; upcoming/draft batches show zero. Cancelled date progress cannot advance beyond cancellation. This is calendar progress, not an attendance or competency claim. Days remaining is clamped at zero.
- **Tasks Completed** counts current Approved/Completed submissions. Pending is assigned visible tasks minus completed tasks. Assignment targets, publish dates, feature availability and enrollment status determine visibility.
- **Videos Watched** counts recorded classes with at least 90% unique observed playback coverage, using the stored video duration. Heartbeats are sent by the existing player, bounded by elapsed server time; immediate seeking, overlapping playback ranges and admin previews do not produce completion credit. Unknown-duration videos cannot be marked complete. Browser playback signals measure activity, not proof that a person paid attention.
- **Discoveries Read** uses existing Learn & Discover read records. New reads also enter the activity ledger.
- Upcoming tasks and activity use actual stored dates/events. No example production students, fake progress, fake charts or fabricated badges are seeded.

## Certificates and public verification

Supported types: Internship, Completion, Project and Achievement Certificate. Certificates store necessary immutable issuance snapshots (student name/ID, domain, batch name/code, dates/duration) so historical documents remain meaningful.

Eligibility requires a completed enrollment in a completed batch, Approved/Completed required tasks, and completion of required videos. Batch-targeted tasks belong to that batch; domain/student requirements assigned during the batch date window also apply. Visibility switches do not erase historical requirements. Eligibility is advisory until an administrator explicitly issues the certificate; no automatic issuance occurs.

Certificate IDs use `INX-INT-<year>-<16 random hexadecimal characters>`, backed by a unique index. They are not sequential database IDs. A second partial unique index prevents duplicate active certificates of the same type for the same student and batch. Revoked records remain stored; a later explicit reissue can create a new verification ID.

Public routes:

- `/verify`: enter an ID, without logging in.
- `/verify/:certificateId`: direct result and QR destination. A QR can encode the site's full URL ending in this path; no session/authentication token is used.

The public API returns exactly certificate ID, student name, certificate type, internship domain, batch name, duration, issue date and Active/Revoked status. The page displays VERIFIED CERTIFICATE, Certificate Revoked, or Certificate Not Found as appropriate. Email, phone, student record IDs, session data and password fields are excluded. The certificate feature switch also disables the public API.

## Notifications

The header bell appears for signed-in students when notifications are enabled. It has an unread count and opens a responsive modal panel with All/Unread views, per-item read actions, Mark All as Read and internal links. Pages contain 30 items with Previous/Next controls. The bell refreshes on relevant in-app changes, when opened, and every two minutes while the page is visible.

Batch assignments, submission reviews/resubmission requests and certificate issuance/revocation create persistent recipient-specific events. Inbox synchronization also derives idempotent notifications from the student's approved application, assigned tasks and upcoming deadlines, published recordings, live-class changes, active announcements and relevant discovery content. Source keys prevent duplicate delivery or unread-count inflation. Time-sensitive content synchronization covers recent source updates; deadline notifications cover the next two days. It runs on inbox requests rather than requiring an external scheduler.

All queries and mark-read mutations use the authenticated student's database identity. Client-supplied student identifiers cannot change the inbox owner. Manual messages use the admin-selected individual or domain audience. No browser push, emails or automated WhatsApp messages are sent.

## Analytics and lead management

The central dashboard shows actual total/active students, active enabled batches, pending applications, published task definitions, pending reviews, certificates issued (including revoked historical issuance), project enquiries, unread messages, published news and recorded video records.

Charts use MongoDB aggregation for monthly registrations, students by domain, application statuses, monthly enquiry trends, submission review status and enrolled/completed batch membership. Monthly charts cover the last 180 days. Tasks Assigned in admin analytics means published task definitions, while student progress counts tasks accessible to that student. These distinctions are labeled in the UI.

Lead statuses are New, Contacted, Interested, Follow-up, Payment Pending, Confirmed, In Progress, Completed and Closed, with legacy Converted compatibility. Lead cards count new, interested, confirmed and completed records plus follow-ups due. Due counts exclude Completed, Closed and Converted. No duplicate lead collection was created; the existing enquiry status endpoint also records status history.

## Optional engagement

Gamification and the leaderboard default to OFF. Turning them off does not delete records. XP is assigned on the server only:

| Tracked event | XP | Deduplication |
| --- | ---: | --- |
| First authenticated dashboard visit | 10 | Once per student |
| First task submission | 20 | Once per task/student |
| Approved/completed task | 40 | Once per task/student |
| Recorded class completed | 30 | Once per video/student |
| Day with observed recorded learning | 2 | Once per UTC day/student |
| Discovery read | 5 | Once per item/student |
| Internship batch completed | 100 | Once per batch/student |

Badges cover First Login, First Video Completed, First Task Submitted, Task Master (five completed tasks), 7-Day Learner, Learning Explorer (five discoveries), and Internship Completed. Learning streaks use distinct UTC learning dates; login alone does not extend a streak. Events tracked while gamification is off receive zero XP and are not retroactively rewarded. A repeated review, read, submission or playback completion cannot repeatedly award the same points.

The optional leaderboard is authenticated, displays student IDs and XP only, excludes suspended accounts, and supports student self-exclusion through the dashboard. It never returns full names, emails, phone numbers or private account records.

## Feature switches, compatibility and storage

The existing WebsiteConfig gets six shared defaults, used by both server and client:

| Setting | Default |
| --- | --- |
| batchesEnabled | true |
| tasksEnabled | true |
| certificateVerificationEnabled | true |
| notificationsEnabled | true |
| gamificationEnabled | false |
| leaderboardEnabled | false |

Switches are managed in the existing Admin → Website Settings page. Student pages hide disabled features; corresponding management/student/verification endpoints enforce the relevant switch server-side. Admin can still change settings and retain historical data. Leaderboard access requires both engagement switches. Existing records receive defaults when read; there is no destructive data migration or bulk rewrite.

Existing models extended:

- `WebsiteConfig`: the six feature flags.
- `Student`: `leaderboardExcluded`, default false for compatibility.
- `Enquiry`: additional statuses, `followUpDate`, append-only `internalNotes` and `statusHistory` arrays.

New MongoDB models/collections:

| Model | Collection | Important indexes |
| --- | --- | --- |
| InternshipBatch | internshipbatches | unique code; status |
| BatchEnrollment | batchenrollments | unique student/status for Enrolled only; student/batch/history |
| InternshipTask | internshiptasks | domain/status/assignedDate; target references |
| TaskSubmission | tasksubmissions | unique task/student; status |
| LearningFile | learningfiles | task/student references |
| Certificate | certificates | unique certificateId; unique active student/batch/type |
| StudentNotification | studentnotifications | unique student/source key; student/date |
| LearningActivity | learningactivities | unique student/event key |
| VideoProgress | videoprogresses | unique student/video |

Models and indexes initialize with the existing server. A redundant nonunique student index created during early development is harmless; the final active-enrollment constraint uses its own compound partial unique index. No existing records or indexes were dropped.

Task files live under `server/uploads/learning/`, following the existing separate-filesystem storage architecture. MongoDB stores metadata and references only. Existing `.gitignore` already ignores `server/uploads/`. Optional `LEARNING_STORAGE_DIR` selects a persistent storage directory; it is not required and no real `.env` was changed. Back up this directory together with MongoDB. Old submission files are retained for revision history; unused uploads are not automatically deleted.

Allowed files: PDF, PNG, JPG/JPEG and UTF-8 TXT, maximum 10 MB. Validation checks filename, extension, size and content signatures rather than trusting the declared MIME type. Executable extensions, traversal names, binary text, common script/document-active-content patterns and mismatched content are rejected. This is format validation, not a malware-scanning service. Files receive random server filenames, are served only through authorized attachment responses, and are never mounted as a public static directory. The API does not expose filesystem paths.

## API inventory

All routes are mounted in `server/server.js`. The new routers precede the existing catch-all admin collection router. Existing routes remain available.

Student base: `/api/student/learning` (existing student session required; writes additionally require existing Origin and CSRF validation):

```text
GET  /progress
GET  /tasks
POST /tasks/:id/submit
PUT  /tasks/:id/file             (binary upload; Origin + CSRF checked)
GET  /files/:id
POST /videos/:id/progress
GET  /notifications
POST /notifications/read-all
POST /notifications/:id/read
GET  /gamification
GET  /leaderboard
PUT  /leaderboard-preference
```

Admin base: `/api/admin/learning` (existing admin JWT and activity log):

```text
GET          /analytics
GET          /catalog
GET, POST    /batches
PATCH, DELETE /batches/:id
GET, POST    /batches/:id/students
DELETE       /batches/:id/students/:enrollmentId
GET, POST    /tasks
PATCH        /tasks/:id
PUT          /tasks/:id/file
GET          /files/:id
GET          /submissions
PATCH        /submissions/:id
GET, POST    /certificates
GET          /eligibility/:id
POST         /certificates/:id/revoke
GET, POST    /notifications
GET          /leads
PATCH        /leads/:id
```

Public: `GET /api/certificates/verify/:certificateId` (no login; strict ID format, rate limit, explicit public field projection).

Existing integrations extended: `/api/student/dashboard` displays batch status; the discovery mark-read handler records real learning; `/api/admin/enquiries/:id/status` retains its URL and adds history. The shared frontend API helper now preserves the JSON content-type header alongside admin authorization, fixing form payload parsing without changing authentication.

## Security review

- Student identity always comes from existing validated HttpOnly-cookie sessions; task targets and enrollment membership are checked server-side.
- Submissions, files, progress, certificate lists and notifications are owner-scoped. Public certificate verification deliberately exposes only the eight approved fields.
- Student writes require existing CSRF and Origin protections; binary uploads use an equivalent Origin check plus the same CSRF validator.
- All admin actions use the existing JWT middleware, with audit records for successful mutations. Bodies, credentials, feedback content and tokens are not logged to the audit trail.
- Batch capacity and transfers are transactional. Active enrollment, submission ownership pairs, event keys and certificate identifiers have database uniqueness constraints.
- Reviews/resubmissions use optimistic version checks. Submission bodies and file identifiers are validated; another student's file cannot be attached.
- No bcrypt, password-policy, session, cookie, Remember Me or admin-login replacement. Existing safe login return paths were extended only for `/student/tasks` and `/student/certificates`.
- Theme selector component, theme initialization and premium theme stylesheet remain unchanged. New styles use existing theme tokens and scoped responsive rules.

## Validation and operational notes

Commands run from the current workspace in PowerShell:

```powershell
node --test server/learning.test.js server/student-auth.test.js server/content-videos.test.js server/tech-news.test.js server/management.test.js server/discover.test.js server/discover-security.test.js server/api-limits.test.js
node --test --test-concurrency=1 tests/learning-ui.test.mjs tests/news-hub-ui.test.mjs tests/student-ui.test.mjs tests/management-ui.test.mjs tests/discover-ui.test.mjs tests/theme.test.mjs
npm.cmd run lint
npm.cmd run build
```

The full backend/API suite passed 13 tests. The learning workflow suite was rerun after the final concurrency checks and passed. The UI/theme suite passed 9 tests. Coverage includes capacity/transfer/removal history, concurrent last-seat assignment, audience filtering, CSRF, upload validation/privacy, submission revisions/reviews, progress, eligibility, unique certificates, public field privacy and revocation, notification privacy/read actions, real analytics, lead history, XP deduplication/leaderboard exclusion and all feature switches. Existing authentication, management/projects, recordings, news, discovery, settings, News Hub and theme regressions passed. Tests use uniquely named databases and temporary files, then clean up only their own fixtures.

Lint passes. Build passes with the existing warning about a JavaScript chunk larger than 500 kB. No new package dependencies were added. Development checks confirmed settings return 200, unauthenticated new private routes return 401, and the existing Vite server serves the new frontend routes/modules without transform errors.

No browser is connected to the available automation tool, so visual browser inspection and real click-through testing remain unverified. UI validation uses rendering/contracts and request-header assertions, plus live HTTP/API testing. No claim of screenshot-verified layouts is made.

No requested module is intentionally deferred. QR-ready verification URLs are supported; this phase does not generate QR bitmap images or certificate PDF files. Browser push and automatic external messaging remain outside this in-app feature set. The code retains sensible bounded management lists (up to 500 recent records), and the notification panel is paginated.

No deployment, commit, push, `.env` secret changes or fake production student records.

## Files created and modified

The manifest below covers this learning upgrade and its continuation, compared with the working tree immediately before the master request. Earlier uncommitted website/news/authentication work was preserved.

<!-- CHANGE_MANIFEST -->

Created (31):

```text
STUDENT_LEARNING_PLATFORM.md
server/controllers/batches.js
server/controllers/certificates.js
server/controllers/leads.js
server/controllers/learning-analytics.js
server/controllers/learning-files.js
server/controllers/learning-progress.js
server/controllers/notifications.js
server/controllers/tasks.js
server/learning.test.js
server/models/learning.js
server/routes/learning.js
server/services/learning-access.js
server/services/learning-activity.js
server/services/learning-notifications.js
server/services/learning-progress.js
server/storage/learning-files.js
shared/learning.js
src/BatchAdmin.jsx
src/CertificatePages.jsx
src/EngagementAdmin.jsx
src/LeadsAdmin.jsx
src/LearningAnalytics.jsx
src/NotificationCenter.jsx
src/StudentLearning.jsx
src/TaskAdmin.jsx
src/learning-api.js
src/learning-ui.jsx
src/learning.css
src/useVideoTracking.js
tests/learning-ui.test.mjs
```

Modified (17):

```text
server/controllers/admin.js
server/controllers/discover.js
server/models/index.js
server/models/management.js
server/models/student.js
server/routes/student.js
server/server.js
src/Admin.jsx
src/App.jsx
src/ContentCreation.jsx
src/ManagementAdmin.jsx
src/StudentDashboard.jsx
src/api.js
src/components.jsx
src/site-context.js
src/student-api.js
tests/news-hub-ui.test.mjs
```
