# Database Schema and Data Field Inventory

This document is based on the real, implemented Mongoose schemas and route/controller wiring in the current workspace. It reflects the actual database model in `server/models` plus the supporting controller and service logic; it does not invent fields that are not present in code.

## Collection inventory

| Collection | Model | Purpose | Source files |
|---|---|---|---|
| projects | Project | Public project catalog | server/models/index.js; server/controllers/public.js; server/controllers/admin.js |
| enquiries | Enquiry | Lead CRM for project interest | server/models/index.js; server/controllers/public.js |
| customprojects | CustomProject | Custom request tracking | server/models/index.js; server/controllers/public.js |
| internshipapplications | InternshipApplication | Internship candidate intake | server/models/index.js; server/controllers/public.js |
| contactmessages | ContactMessage | Visitor support inbox | server/models/index.js; server/controllers/public.js |
| admins | Admin | Admin authentication | server/models/index.js |
| students | Student | Student identity and accounts | server/models/student.js |
| studentsessions | StudentSession | Authenticated session tokens | server/models/student.js |
| internshipbatches | InternshipBatch | Cohort definition | server/models/learning.js; server/controllers/batches.js |
| batchenrollments | BatchEnrollment | Student-to-batch subscriptions | server/models/learning.js; server/controllers/batches.js |
| internshiptasks | InternshipTask | Learning task definitions | server/models/learning.js; server/controllers/tasks.js |
| tasksubmissions | TaskSubmission | Student work and review records | server/models/learning.js; server/controllers/tasks.js |
| certificates | Certificate | Issued credentials | server/models/learning.js; server/controllers/certificates.js |
| studentnotifications | StudentNotification | Notification feed | server/models/learning.js; server/controllers/notifications.js |
| learningactivities | LearningActivity | XP and activity tracking | server/models/learning.js; server/services/learning-progress.js |
| discoversources | DiscoverSource | Trusted external feed registry | server/models/discover.js; server/services/discover-fetch.js |
| discoveritems | DiscoverItem | Student discover feed | server/models/discover.js; server/controllers/discover.js |
| discoverreads | DiscoverRead | Read tracking | server/models/discover.js |
| technews | TechNews | Editorial technology articles | server/models/tech-news.js; server/controllers/tech-news.js |
| contentcreationvideos | ContentVideo | Recorded class media metadata | server/models/content-video.js; server/controllers/content-videos.js |
| websiteconfigs | WebsiteConfig | Singleton site config | server/models/management.js |

## Key model groups

- Project (`projects`): Public project catalog. Source: server/models/index.js; server/controllers/public.js; server/controllers/admin.js.
- Enquiry (`enquiries`): Lead CRM for project interest. Source: server/models/index.js; server/controllers/public.js.
- CustomProject (`customprojects`): Custom request tracking. Source: server/models/index.js; server/controllers/public.js.
- InternshipApplication (`internshipapplications`): Internship candidate intake. Source: server/models/index.js; server/controllers/public.js.
- ContactMessage (`contactmessages`): Visitor support inbox. Source: server/models/index.js; server/controllers/public.js.
- Admin (`admins`): Admin authentication. Source: server/models/index.js.
- Student (`students`): Student identity and accounts. Source: server/models/student.js.
- StudentSession (`studentsessions`): Authenticated session tokens. Source: server/models/student.js.
- InternshipBatch (`internshipbatches`): Cohort definition. Source: server/models/learning.js; server/controllers/batches.js.
- BatchEnrollment (`batchenrollments`): Student-to-batch subscriptions. Source: server/models/learning.js; server/controllers/batches.js.

## Data source classifications

| Category | Typical source | Example models |
|---|---|---|
| STUDENT INPUT | Student registration | Student.fullName, Student.email, Student.phone, Student.internshipDomain |
| STUDENT INPUT | Project enquiry | Enquiry.studentName, Enquiry.message, Enquiry.project |
| STUDENT INPUT | Task submission | TaskSubmission.revisions, LearningFile.originalName |
| ADMIN INPUT | Admin content management | Project.*, InternshipBatch.*, InternshipTask.*, DiscoverItem.*, TechNews.* |
| SYSTEM GENERATED | MongoDB ObjectId + timestamps | _id, createdAt, updatedAt |
| SYSTEM GENERATED | Student session tokens | StudentSession.tokenHash, Student.studentId |
| SYSTEM CALCULATED | Progress and eligibility | task completion, video progress, certificate requirements |
| EXTERNAL TRUSTED SOURCE | RSS / Atom / JSON feed import | DiscoverSource.url, DiscoverSource.type, DiscoverItem.* |
| SEED / INITIAL DATA | Project seed list | Project.* |
| SEED / INITIAL DATA | Website defaults | WebsiteConfig.* |

## Primary relationships

| Parent / Subject | Child / Related | Relationship |
|---|---|---|
| Project | Enquiry.project | A project lead stores a snapshot reference to the selected project |
| Student | StudentSession.student | A student can have multiple active session records |
| Student | BatchEnrollment.student | Batch membership is tracked per student |
| InternshipBatch | BatchEnrollment.batch | A batch can contain many enrolled students |
| InternshipTask | TaskSubmission.task | A task can have many submissions |
| Student | TaskSubmission.student | Each student-task pair has one submission record |
| Student | Certificate.student | Each certificate is tied to a student |
| BatchEnrollment | Certificate.enrollment | Certificate issuance references an enrollment record |
| DiscoverCategory | DiscoverItem.category | Items are grouped by category |
| Student | DiscoverRead.student | Read tracking is stored per student and item |

## Seed and initialization behavior

- Project catalog seed: Default product catalog and project list (`server/seed.js; src/data.js`). Trigger: When seed script is run.
- Default discover categories: Category catalog seeded only if empty (`server/models/discover.js -> ensureDiscoverCategories()`). Trigger: On startup or first access.
- Website config singleton: settings, homepage and services defaults (`server/models/management.js -> getConfig()`). Trigger: First access to config.
- Initial admin account: Admin email + hash created if missing (`server/create-admin.js; server/server.js`). Trigger: Bootstrap when app starts.

## External feed and storage constraints

- Feed imports are validated in `server/services/discover-fetch.js` and restricted to trusted public HTTPS URLs.
- Learning file uploads and recorded-class media are stored on disk, with only metadata persisted in the MongoDB collections.
- The singleton `WebsiteConfig` document holds site-level settings, homepage content and feature toggles.

## Sensitive data handling

- `Admin` -> `passwordHash`: Auth credential hash. Protection: Stored as a bcrypt hash and not returned in public API responses.
- `Student` -> `passwordHash, resetTokenHash, resetExpiresAt`: Authentication and recovery data. Protection: Hidden via schema select:false and JSON transform.
- `Student` -> `email, phone`: Direct contact information. Protection: Returned only in authenticated/admin contexts.
- `Enquiry` -> `email, phoneInternational, message`: Lead contact data. Protection: CRM/admin access only.
- `ContactMessage` -> `email, phone, message`: Customer support messages. Protection: Visible to admin inbox only.
- `StudentSession` -> `tokenHash`: Active login session credential. Protection: Stored in hashed form with expiry TTL.

## Important implementation files reviewed

- `server/models/index.js`
- `server/models/student.js`
- `server/models/learning.js`
- `server/models/discover.js`
- `server/models/management.js`
- `server/models/content-video.js`
- `server/models/tech-news.js`
- `server/controllers/public.js`
- `server/controllers/admin.js`
- `server/controllers/batches.js`
- `server/controllers/tasks.js`
- `server/services/learning-progress.js`
- `server/services/discover-fetch.js`
- `server/storage/learning-files.js`
- `server/storage/content-videos.js`

## Scope note

This inventory intentionally reflects only fields and flows visible in the actual code. It does not add undocumented fields or assume schemas beyond what the workspace implements.
