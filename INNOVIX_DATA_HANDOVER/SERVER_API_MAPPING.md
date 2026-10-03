# Server API Mapping

The server exposes routes via Express routers defined in the files under `server/routes` and implemented by controllers/services under `server/controllers`, `server/services`, and `server/storage`.

## Public routes

- `GET /api/configuration` -> public configuration data (`public.js`)
- `GET /api/tech-news` and `GET /api/tech-news/:id` -> public tech news endpoints (`public.js`)
- `GET /api/projects` and `GET /api/projects/:slug` -> public project catalog (`public.js`)
- `GET /api/testimonials` -> public testimonials (`public.js`)
- `POST /api/enquiries` -> leads / project enquiry creation (`public.js`)
- `POST /api/custom-projects` -> custom project request submission (`public.js`)
- `POST /api/internships/apply` -> internship application submission (`public.js`)
- `POST /api/contact` -> contact form submission (`public.js`)

## Admin routes

- `POST /api/admin/login` -> admin auth (`admin.js`)
- `GET /api/admin/configuration` and `PUT /api/admin/configuration/:section` -> config/admin settings (`admin.js`)
- `GET /api/admin/internship-domains` and `PATCH /api/admin/internship-domains/:id` -> internship domain management (`admin.js`)
- `GET /api/admin/students` and `PATCH /api/admin/students/:id/account-status` -> student listing and account status updates (`admin.js`)
- `GET /api/admin/announcements`, `POST /api/admin/announcements`, `PUT /api/admin/announcements/:id`, `DELETE /api/admin/announcements/:id` -> announcements (`admin.js`)
- `GET /api/admin/profile` and `GET /api/admin/activity` -> admin profile and audit trail (`admin.js`)
- `GET /api/admin/tech-news`, `POST /api/admin/tech-news`, `PUT /api/admin/tech-news/:id`, `PATCH /api/admin/tech-news/:id`, `DELETE /api/admin/tech-news/:id` -> tech news management (`admin.js`)
- `GET /api/admin/dashboard` -> dashboard metrics and aggregate views (`admin.js`)
- `GET /api/admin/projects`, `POST /api/admin/projects`, `PUT /api/admin/projects/:id`, `PATCH /api/admin/projects/:id`, `DELETE /api/admin/projects/:id` -> catalog management (`admin.js`)
- `GET /api/admin/messages/all`, `PATCH /api/admin/messages/:id/read`, `DELETE /api/admin/messages/:id` -> contact message handling (`admin.js`)
- `GET /api/admin/testimonials/all`, `POST /api/admin/testimonials`, `PUT /api/admin/testimonials/:id`, `PATCH /api/admin/testimonials/:id`, `DELETE /api/admin/testimonials/:id` -> testimonial management (`admin.js`)
- `GET /api/admin/:collection` -> generic collection listing (`admin.js`)
- `PATCH /api/admin/:collection/:id/status` -> generic status updates (`admin.js`)

## Student routes

- `POST /api/student/register` -> student registration (`student.js`)
- `POST /api/student/login` -> login (`student.js`)
- `GET /api/student/me` -> current student profile (`student.js`)
- `GET /api/student/dashboard` -> dashboard summary (`student.js`)
- `POST /api/student/logout` -> logout (`student.js`)
- `POST /api/student/forgot-password` -> password reset initiation (`student.js`)
- `POST /api/student/reset-password` -> password reset completion (`student.js`)

## Learning routes

- Student routes: `learningStudentRoutes` for learning progress, tasks, submissions, notifications and certificate viewing.
- Admin routes: `learningAdminRoutes` for batch creation, task management, submission review, certificate issuance and progression checks.
- Public certificate routes: `certificatePublicRoutes` are used for public certificate verification or display flows.

## Discover routes

- `discoverStudentRoutes` -> Discover feed, read tracking and article discovery (`discover.js`)
- `discoverAdminRoutes` -> feed source management, source refresh, and item moderation (`discover.js`)

## Content creation routes

- `contentVideoPublicRoutes` -> public video listing and playback metadata (`content-videos.js`)
- `contentVideoAdminRoutes` -> admin-side content video upload management (`content-videos.js`)

## Source mapping

- `server/routes/public.js` -> public-facing website models and forms
- `server/routes/admin.js` -> admin operations and system management
- `server/routes/student.js` -> student auth and profile APIs
- `server/routes/learning.js` -> batches, tasks, submissions, notifications and progress
- `server/routes/discover.js` -> Learn & Discover feed and trusted sources
- `server/routes/content-videos.js` -> content creation video system
