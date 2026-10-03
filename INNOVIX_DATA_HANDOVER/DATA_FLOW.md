# Data Flow

This document explains the lifecycle of data from initial user or admin entry to the rendering of records and derived platform state.

## 1. Public lead and contact capture

- Contact forms, project enquiries, custom requests and internship applications are submitted through public endpoints.
- Their payloads are stored into their corresponding MongoDB collections (`Enquiry`, `CustomProject`, `InternshipApplication`, `ContactMessage`).
- Admin consoles read and update these records through admin endpoints and generic status patch routes.

## 2. Student onboarding and authentication

- Student registration creates `Student` records with hashed password data and generated student identity fields.
- `StudentSession` records track hashed session tokens with expiry, and are used to authenticate future requests.
- Student dashboard behavior uses `StudentSession`, current student data, and enrollment state to create the authenticated experience.

## 3. Batch, task and submission flow

- An admin creates or edits `InternshipBatch` documents.
- Students are linked to batches through `BatchEnrollment` records.
- An admin assigns `InternshipTask` records to a student, batch or domain.
- Student work is submitted through `TaskSubmission` and optionally associated `LearningFile` metadata.
- Review actions update `TaskSubmission.status`, `revisions`, marks and feedback.

## 4. Progress and achievement pipeline

- Progress computations draw from completed tasks, submitted work, discovered reads, and watched video progress.
- `LearningActivity` accumulates per-student XP and activity records.
- `VideoProgress` tracks watched time and completion state per video.
- These data points contribute to derived educational outcomes and certificate readiness.

## 5. Certificate issuance

- Eligibility checks are performed by the service layer that computes progress and completion state.
- On successful evaluation, `Certificate` records are created containing student, batch, type, status and issue metadata.
- The certificate state can later be revoked or updated by admin actions.

## 6. Discover feed architecture

- Trusted sources are defined in `DiscoverSource`.
- Feed import jobs validate URL safety, source type and feed format.
- Imported entries become `DiscoverItem` records and are indexed by category and status.
- Student reads are recorded via `DiscoverRead` so the system can track consumption and engagement.

## 7. Content creation media pipeline

- Media metadata is stored in `ContentVideo` documents.
- Files themselves are stored on disk in the content storage area used by the server file system wrapper.
- Public playback routes serve the content metadata and associated file paths.

## 8. Site configuration and admin operations

- `WebsiteConfig` stores singletons for homepage content, feature flags and default service metadata.
- Admin controls update these config values without replacing the whole runtime logic.
- `AdminActivity` tracks action and target, not a full request record.
